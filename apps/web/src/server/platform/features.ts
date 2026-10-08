// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { parseFeatureFlags, type FeatureFlag } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { getFeatureFlagsRaw } from '@/lib/db/platform';
import { ApiError } from '@/lib/http/errors';

/**
 * Per-agency feature flags (FR-ADM-10). Read the flag where the feature starts; a flag that is off
 * answers 403 `feature_disabled`, which the UI shows as "turned off for your agency".
 */
export const featureDisabled = (flag: FeatureFlag) =>
  new ApiError('feature_disabled', 'This feature is turned off for your agency', {
    status: 403,
    fields: { feature: flag },
  });

/** Inside an agency transaction (the Agency row is a platform table, readable from it). */
export async function assertFeature(
  tx: Pick<ScopedTx, 'agency'>,
  agencyId: string,
  flag: FeatureFlag,
): Promise<void> {
  const row = await tx.agency.findUnique({
    where: { id: agencyId },
    select: { featureFlags: true },
  });
  if (!parseFeatureFlags(row?.featureFlags)[flag]) throw featureDisabled(flag);
}

/** Outside a transaction (pages and portal sign-in). */
export async function isFeatureEnabled(agencyId: string, flag: FeatureFlag): Promise<boolean> {
  return parseFeatureFlags(await getFeatureFlagsRaw(agencyId))[flag];
}
