// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { GUARD_KEYS, type GuardKey, type GuardMode } from './settings';

/** One guard that was not satisfied (api-contracts: `409 guard_failed { guards[] }`). */
export interface GuardFailure {
  guard: GuardKey;
  /** `block`: the action cannot go ahead. `warn`: it can, with an override and a reason. */
  mode: GuardMode;
  message: string;
}

/** A recruiter's decision to go ahead despite a `warn` guard; the reason is kept in the activity log. */
export const guardOverrideSchema = z.object({
  guard: z.enum(GUARD_KEYS),
  reason: z.string().trim().min(3).max(500),
});
export type GuardOverride = z.infer<typeof guardOverrideSchema>;
