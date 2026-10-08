// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { agencySettingsPatchSchema } from './settings';

/**
 * Per-agency feature flags a platform owner or admin can switch (FR-ADM-10). Every flag here is
 * enforced by the code it names; add a flag only together with the check that honours it.
 */
export const FEATURE_FLAGS = {
  /** Hiring-manager and candidate portals: invitations, shares and the portal pages. */
  portals: { default: true },
  /** Sending email from the product. Off keeps "copy and mark as sent" working. */
  email_sending: { default: true },
} as const;
export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[];

export type FeatureFlagValues = Record<FeatureFlag, boolean>;

/** Reads `Agency.featureFlags` leniently: an unknown key is ignored, a missing or malformed one takes its default. */
export function parseFeatureFlags(raw: unknown): FeatureFlagValues {
  const object =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    FEATURE_FLAG_KEYS.map((key) => [
      key,
      typeof object[key] === 'boolean' ? object[key] : FEATURE_FLAGS[key].default,
    ]),
  ) as FeatureFlagValues;
}

/** `PUT /api/admin/v1/agencies/:id/features`. */
export const setFeatureFlagInputSchema = z.object({
  flag: z.enum(FEATURE_FLAG_KEYS as [FeatureFlag, ...FeatureFlag[]]),
  enabled: z.boolean(),
});
export type SetFeatureFlagInput = z.infer<typeof setFeatureFlagInputSchema>;

/** The key under which the settings new agencies start from are stored in `PlatformConfig`. */
export const NEW_AGENCY_DEFAULTS_KEY = 'new_agency_defaults';

/** `PUT /api/admin/v1/config/new-agency-defaults`: a patch of agency settings, validated like the agency's own. */
export const newAgencyDefaultsSchema = agencySettingsPatchSchema;
export type NewAgencyDefaults = z.infer<typeof newAgencyDefaultsSchema>;
