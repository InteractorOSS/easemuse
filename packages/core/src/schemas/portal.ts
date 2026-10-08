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

/**
 * `GET /portal-users`: the people the recruiter can invite. Give the position or the pipeline entry
 * (the contacts of its client) or a candidate (that one person).
 */
export const portalDirectoryQuerySchema = z
  .object({
    positionId: z.guid().optional(),
    entryId: z.guid().optional(),
    candidateId: z.guid().optional(),
  })
  .refine((v) => [v.positionId, v.entryId, v.candidateId].filter(Boolean).length === 1, {
    message: 'Give exactly one of positionId, entryId or candidateId',
  });
export type PortalDirectoryQuery = z.infer<typeof portalDirectoryQuerySchema>;

/** `GET /portal-shares` */
export const listSharesQuerySchema = z.object({
  kind: z.enum(['jd_for_approval', 'submission', 'tailored_resume', 'intake_form']),
  subjectId: z.guid(),
});
