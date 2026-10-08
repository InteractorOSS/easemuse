// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const PORTAL_AUDIENCES = ['hiring_manager', 'candidate'] as const;
export type PortalAudienceValue = (typeof PORTAL_AUDIENCES)[number];

/** Invitation links last a week; a re-login link only minutes (ADR-002). */
export const PORTAL_INVITE_TTL_DAYS = 7;
export const PORTAL_RELOGIN_TTL_MINUTES = 15;
/** A portal session ends after this long, whatever the activity. */
export const PORTAL_SESSION_HOURS = 12;

/**
 * `POST /portal-users` (FR-HMP-01, FR-CDP-01): the recruiter invites a client contact or a
 * candidate. The email is the one on file for that person; it is never typed here.
 */
export const invitePortalUserInputSchema = z.discriminatedUnion('audience', [
  z.object({ audience: z.literal('hiring_manager'), clientContactId: z.guid() }),
  z.object({ audience: z.literal('candidate'), candidateId: z.guid() }),
]);
export type InvitePortalUserInput = z.infer<typeof invitePortalUserInputSchema>;

export const redeemInputSchema = z.object({ token: z.string().min(20).max(200) });
export const reloginInputSchema = z.object({
  email: z.email().max(254),
  audience: z.enum(PORTAL_AUDIENCES),
});
