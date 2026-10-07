// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencySettings, GuardFailure, GuardKey, GuardOverride } from '@easemuse/core';
import { ApiError } from '@/lib/http/errors';

/**
 * Applies the agency's guard rules to the guards an action did not satisfy (FR-TEN-03, brief 1.1).
 * A `block` guard stops the action. A `warn` guard stops it too, unless the caller passed an override
 * for that guard with a reason. Returns the overrides that were used, for the activity log.
 */
export function applyGuards(
  unsatisfied: { guard: GuardKey; message: string }[],
  modes: AgencySettings['guardModes'],
  overrides: GuardOverride[] = [],
): GuardOverride[] {
  const used: GuardOverride[] = [];
  const stopped: GuardFailure[] = [];
  for (const item of unsatisfied) {
    const mode = modes[item.guard];
    const override = overrides.find((o) => o.guard === item.guard);
    if (mode === 'warn' && override) used.push(override);
    else stopped.push({ guard: item.guard, mode, message: item.message });
  }
  if (stopped.length > 0) {
    throw new ApiError('guard_failed', stopped.map((s) => s.message).join(' '), {
      guards: stopped,
    });
  }
  return used;
}
