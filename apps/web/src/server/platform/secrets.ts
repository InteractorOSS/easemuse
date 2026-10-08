// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { PlatformAdminActor } from '@easemuse/core';
import { clearPlatformAlert, getPlatformAlert, getPlatformSecretRow, withUser } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ApiError, forbidden } from '@/lib/http/errors';
import { recordPlatformAudit } from './audit';

/** Names of the secrets an owner can store. */
export const SECRET_NAMES = ['anthropic_api_key', 'voyage_api_key'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

const VERSION = 'v1';

function keyFor(material: string): Buffer {
  return Buffer.from(hkdfSync('sha256', material, 'easemuse-platform-secrets', 'aes-256-gcm', 32));
}

/**
 * AES-256-GCM with a random nonce: `v1.<nonce>.<tag>.<ciphertext>` (base64url). The key comes from
 * `SECRETS_ENCRYPTION_KEY`, or `AUTH_SECRET` when that is not set. Changing the key makes stored
 * secrets unreadable: the owner then enters them again.
 */
export function encryptSecret(plain: string, material: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(material), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    body.toString('base64url'),
  ].join('.');
}

/** Returns null for anything that does not decrypt (wrong key, damaged value): never throws. */
export function decryptSecret(stored: string, material: string): string | null {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFor(material),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

const material = (): string => {
  const env = getEnv();
  const m = env.SECRETS_ENCRYPTION_KEY ?? env.AUTH_SECRET;
  if (!m) throw new Error('AUTH_SECRET or SECRETS_ENCRYPTION_KEY is required to store secrets');
  return m;
};

/** An Anthropic key looks like `sk-ant-...`; anything else is refused before it is stored. */
export function validateAnthropicKey(value: string): string {
  const key = value.trim();
  if (!/^sk-ant-[\w-]{20,}$/.test(key)) {
    throw new ApiError(
      'invalid_input',
      'That does not look like an Anthropic API key (it starts with sk-ant-)',
      {
        status: 422,
        fields: { apiKey: 'Not an Anthropic API key' },
      },
    );
  }
  return key;
}

/** The platform alert that remembers an Anthropic account problem (see the AI gateway). */
export const ANTHROPIC_ACCOUNT_ALERT = 'anthropic_account';

/** The latest AI account problem seen by real calls, so administrators can act on it. */
export interface AccountProblem {
  code: 'no_key' | 'invalid_key' | 'no_credit';
  firstAt: Date;
  lastAt: Date;
  count: number;
}

export interface SecretStatus {
  configured: boolean;
  /** Where the key in use comes from: the admin area wins over the environment. */
  source: 'admin' | 'environment' | 'none';
  /** The last four characters of the key in use, never more. */
  last4: string | null;
  updatedAt: Date | null;
  /** The stored value cannot be decrypted (the encryption key changed): enter it again. */
  unreadable: boolean;
  /** Anthropic only: the account problem real AI calls ran into, until a call works again. */
  problem?: AccountProblem | null;
}

/** A Voyage key looks like `pa-...`; anything else is refused before it is stored. */
export function validateVoyageKey(value: string): string {
  const key = value.trim();
  if (!/^pa-[\w-]{20,}$/.test(key)) {
    throw new ApiError(
      'invalid_input',
      'That does not look like a Voyage API key (it starts with pa-)',
      { status: 422, fields: { apiKey: 'Not a Voyage API key' } },
    );
  }
  return key;
}

interface KeyKind {
  name: SecretName;
  validate(value: string): string;
  fromEnvironment(): string | undefined;
}

const ANTHROPIC: KeyKind = {
  name: 'anthropic_api_key',
  validate: validateAnthropicKey,
  fromEnvironment: () => getEnv().ANTHROPIC_API_KEY,
};
const VOYAGE: KeyKind = {
  name: 'voyage_api_key',
  validate: validateVoyageKey,
  fromEnvironment: () => getEnv().VOYAGE_API_KEY,
};

function assertOwner(actor: PlatformAdminActor): void {
  if (actor.role !== 'owner') throw forbidden('Only a platform owner can change secrets');
}

async function keyStatus(actor: PlatformAdminActor, kind: KeyKind): Promise<SecretStatus> {
  const row = await withUser(actor.userId, (tx) =>
    tx.platformSecret.findUnique({ where: { name: kind.name } }),
  );
  if (row) {
    const readable = decryptSecret(row.ciphertext, material()) !== null;
    return {
      configured: readable,
      source: 'admin',
      last4: row.last4,
      updatedAt: row.updatedAt,
      unreadable: !readable,
    };
  }
  const env = kind.fromEnvironment();
  return env
    ? {
        configured: true,
        source: 'environment',
        last4: env.slice(-4),
        updatedAt: null,
        unreadable: false,
      }
    : { configured: false, source: 'none', last4: null, updatedAt: null, unreadable: false };
}

async function setKey(
  actor: PlatformAdminActor,
  kind: KeyKind,
  value: string,
): Promise<SecretStatus> {
  assertOwner(actor);
  const key = kind.validate(value);
  await withUser(actor.userId, async (tx) => {
    const data = {
      ciphertext: encryptSecret(key, material()),
      last4: key.slice(-4),
      updatedById: actor.userId,
    };
    await tx.platformSecret.upsert({
      where: { name: kind.name },
      create: { name: kind.name, ...data },
      update: data,
    });
    // The audit entry says the key changed, never what it is.
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'config.update',
      targetType: 'secret',
      data: { name: kind.name, change: 'set' },
    });
  });
  clearKeyCache(kind.name);
  // A new or removed key starts fresh: the old problem may no longer apply.
  if (kind === ANTHROPIC) await clearPlatformAlert(ANTHROPIC_ACCOUNT_ALERT);
  return kind === ANTHROPIC ? getAnthropicKeyStatus(actor) : keyStatus(actor, kind);
}

async function clearKey(actor: PlatformAdminActor, kind: KeyKind): Promise<SecretStatus> {
  assertOwner(actor);
  await withUser(actor.userId, async (tx) => {
    await tx.platformSecret.deleteMany({ where: { name: kind.name } });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'config.update',
      targetType: 'secret',
      data: { name: kind.name, change: 'cleared' },
    });
  });
  clearKeyCache(kind.name);
  // A new or removed key starts fresh: the old problem may no longer apply.
  if (kind === ANTHROPIC) await clearPlatformAlert(ANTHROPIC_ACCOUNT_ALERT);
  return kind === ANTHROPIC ? getAnthropicKeyStatus(actor) : keyStatus(actor, kind);
}

export async function getAnthropicKeyStatus(actor: PlatformAdminActor): Promise<SecretStatus> {
  const status = await keyStatus(actor, ANTHROPIC);
  const alert = await getPlatformAlert(ANTHROPIC_ACCOUNT_ALERT);
  return {
    ...status,
    problem: alert ? { ...alert, code: alert.code as AccountProblem['code'] } : null,
  };
}
export const setAnthropicKey = (actor: PlatformAdminActor, value: string) =>
  setKey(actor, ANTHROPIC, value);
export const clearAnthropicKey = (actor: PlatformAdminActor) => clearKey(actor, ANTHROPIC);
export const getVoyageKeyStatus = (actor: PlatformAdminActor) => keyStatus(actor, VOYAGE);
export const setVoyageKey = (actor: PlatformAdminActor, value: string) =>
  setKey(actor, VOYAGE, value);
export const clearVoyageKey = (actor: PlatformAdminActor) => clearKey(actor, VOYAGE);

const cache = new Map<SecretName, { value: string | undefined; at: number }>();
const CACHE_MS = 30_000;

function clearKeyCache(name: SecretName): void {
  cache.delete(name);
}
export const clearAnthropicKeyCache = (): void => clearKeyCache('anthropic_api_key');
export const clearVoyageKeyCache = (): void => clearKeyCache('voyage_api_key');

async function resolveKey(kind: KeyKind, now: number): Promise<string | undefined> {
  const hit = cache.get(kind.name);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  let value: string | undefined;
  try {
    const row = await getPlatformSecretRow(kind.name);
    value = row ? (decryptSecret(row.ciphertext, material()) ?? undefined) : undefined;
  } catch {
    value = undefined; // the database is not reachable (a script, a test): fall back to the environment
  }
  value ??= kind.fromEnvironment();
  cache.set(kind.name, { value, at: now });
  return value;
}

/**
 * The key the AI calls use: the one an owner entered in the admin area, else `ANTHROPIC_API_KEY`.
 * Cached for 30 seconds, and dropped at once when the key is changed in this process. Other
 * processes (the worker) pick a change up within the cache time.
 */
export const resolveAnthropicKey = (now: number = Date.now()) => resolveKey(ANTHROPIC, now);

/** The Voyage key for embeddings: the admin area first, else `VOYAGE_API_KEY` (same rules as above). */
export const resolveVoyageKey = (now: number = Date.now()) => resolveKey(VOYAGE, now);
