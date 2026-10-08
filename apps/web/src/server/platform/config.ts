// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  NEW_AGENCY_DEFAULTS_KEY,
  agencySettingsPatchSchema,
  agencySettingsSchema,
  parseAgencySettings,
  parseFeatureFlags,
  type AgencySettings,
  type FeatureFlag,
  type FeatureFlagValues,
  type NewAgencyDefaults,
  type PlatformAdminActor,
  type SetFeatureFlagInput,
} from '@easemuse/core';
import { getAgencyByRef, withAgency, withUser, type ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { zodFields } from '@/lib/http/responses';
import { PURPOSES } from '@/server/ai/purposes';
import { createPromptRegistry } from '@/server/ai/prompts';
import { registerBuiltInPrompts } from '@/server/ai/prompts/index';
import { recordPlatformAudit } from './audit';

/**
 * Platform configuration for /admin (T-16-02, FR-ADM-10): the AI routing table and prompt versions
 * (read only: they live in code and change only with a deploy and an evaluation run, NFR-AI05), the
 * settings new agencies start from, and per-agency feature flags. Every change is logged.
 */

export interface RoutingRow {
  purpose: string;
  code: string;
  model: string;
  effort: string;
  artifactKind: string | null;
  maxTokens: number;
  /** The prompt module's version, or null when the purpose has no prompt module yet. */
  promptVersion: string | null;
}

export interface PlatformConfigView {
  routing: RoutingRow[];
  flags: { key: FeatureFlag; default: boolean }[];
}

/** The routing table with the version of each purpose's prompt module (the registry is built fresh to read them). */
export function routingTable(): RoutingRow[] {
  const registry = createPromptRegistry();
  registerBuiltInPrompts(registry);
  return Object.entries(PURPOSES).map(([purpose, spec]) => ({
    purpose,
    code: spec.code,
    model: spec.model,
    effort: spec.effort,
    artifactKind: spec.artifactKind,
    maxTokens: spec.maxTokens,
    promptVersion: registry.get(purpose as keyof typeof PURPOSES)?.version ?? null,
  }));
}

async function readDefaults(tx: ScopedTx): Promise<NewAgencyDefaults> {
  const row = await tx.platformConfig.findUnique({ where: { key: NEW_AGENCY_DEFAULTS_KEY } });
  const parsed = agencySettingsPatchSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : {};
}

/** The settings a new agency is created with. `userId` is the platform administrator creating it. */
export async function getNewAgencyDefaults(userId: string): Promise<NewAgencyDefaults> {
  return withUser(userId, readDefaults);
}

export function getPlatformConfig(): PlatformConfigView {
  return {
    routing: routingTable(),
    flags: FEATURE_FLAG_KEYS.map((key) => ({ key, default: FEATURE_FLAGS[key].default })),
  };
}

/** The settings a new agency will get, with every default filled in (what the form shows). */
export async function getNewAgencyDefaultsView(actor: PlatformAdminActor): Promise<AgencySettings> {
  return parseAgencySettings(await getNewAgencyDefaults(actor.userId));
}

/**
 * Changes the settings new agencies start from. Existing agencies are not touched. The merged result
 * is validated as a whole, like an agency's own settings (weights add up to 100, and so on), and the
 * audit entry names the keys, never values.
 */
export async function patchNewAgencyDefaults(
  actor: PlatformAdminActor,
  patch: NewAgencyDefaults,
): Promise<AgencySettings> {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return withUser(actor.userId, async (tx) => {
    const stored = await readDefaults(tx);
    const merged = { ...stored, ...defined };
    const checked = agencySettingsSchema.safeParse(merged);
    if (!checked.success) {
      throw new ApiError('invalid_input', 'Invalid settings', {
        status: 422,
        fields: zodFields(checked.error),
      });
    }
    await tx.platformConfig.upsert({
      where: { key: NEW_AGENCY_DEFAULTS_KEY },
      create: {
        key: NEW_AGENCY_DEFAULTS_KEY,
        value: merged as Prisma.InputJsonValue,
        updatedById: actor.userId,
      },
      update: { value: merged as Prisma.InputJsonValue, updatedById: actor.userId },
    });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'config.new_agency_defaults',
      targetType: 'platform_config',
      data: { keys: Object.keys(defined).join(',') },
    });
    return checked.data;
  });
}

export interface AgencyFeatures {
  agencyId: string;
  flags: FeatureFlagValues;
}

export async function getAgencyFeatures(agencyRef: string): Promise<AgencyFeatures> {
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  const flags = await withAgency(agency.id, async (tx) =>
    parseFeatureFlags(
      (await tx.agency.findUnique({ where: { id: agency.id }, select: { featureFlags: true } }))
        ?.featureFlags,
    ),
  );
  return { agencyId: agency.id, flags };
}

/** Switches one flag for one agency. Logged in the platform audit log and in the agency's activity log. */
export async function setAgencyFeature(
  actor: PlatformAdminActor,
  agencyRef: string,
  input: SetFeatureFlagInput,
): Promise<AgencyFeatures> {
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  const flags = await withAgency(agency.id, async (tx) => {
    const row = await tx.agency.findUnique({
      where: { id: agency.id },
      select: { featureFlags: true },
    });
    const next = { ...parseFeatureFlags(row?.featureFlags), [input.flag]: input.enabled };
    await tx.agency.update({
      where: { id: agency.id },
      data: { featureFlags: next as Prisma.InputJsonValue },
    });
    await tx.activityLog.create({
      data: {
        agencyId: agency.id,
        actorType: 'platform_admin',
        actorId: actor.userId,
        action: 'feature.changed',
        entityType: 'agency',
        entityId: agency.id,
        data: { flag: input.flag, enabled: input.enabled },
      },
    });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'config.feature',
      agencyId: agency.id,
      targetType: 'agency',
      targetId: agency.id,
      data: { flag: input.flag, enabled: input.enabled },
    });
    return next;
  });
  return { agencyId: agency.id, flags };
}
