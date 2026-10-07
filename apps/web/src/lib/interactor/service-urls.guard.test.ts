// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVICE_FALLBACK_URLS } from './service-urls';

/**
 * Guard (T-F-21, ADR-014): Interactor service hosts and their env vars appear only in
 * service-urls.ts and env.ts, so every call site dials the same address for a service.
 */
const SRC = path.resolve(__dirname, '../..');
const OWNERS = [
  path.join(SRC, 'lib', 'interactor', 'service-urls.ts'),
  path.join(SRC, 'lib', 'interactor', 'service-urls.test.ts'),
  path.join(SRC, 'lib', 'interactor', 'service-urls.guard.test.ts'),
  path.join(SRC, 'lib', 'env.ts'),
  path.join(SRC, 'lib', 'env.test.ts'),
];
const ENV_VARS = [
  'ACCOUNT_SERVER_URL',
  'BILLING_SERVER_URL',
  'INTERACTOR_CORE_URL',
  'INTERACTOR_USERDB_URL',
  'UKB_URL',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('service URL ownership', () => {
  const needles = [...Object.values(SERVICE_FALLBACK_URLS), ...ENV_VARS];
  const offenders = sourceFiles(SRC)
    .filter((f) => !OWNERS.includes(f))
    .flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return needles.filter((n) => text.includes(n)).map((n) => `${path.relative(SRC, f)}: ${n}`);
    });

  it('declares every Interactor host only in service-urls.ts', () => {
    expect(offenders).toEqual([]);
  });
});
