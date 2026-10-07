// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { AGENCY_ROLES } from '../roles';

/** URL slugs that would collide with routes or confuse users. */
export const RESERVED_SLUGS = [
  'a',
  'c',
  'h',
  'admin',
  'api',
  'app',
  'auth',
  'invite',
  'login',
  'logout',
  'signin',
  'signout',
  'sign-in',
  'sign-out',
  'static',
  'public',
  'www',
  'support',
  'help',
  'status',
  'easemuse',
  'teamofwakers',
] as const;

/** Lowercase letters, digits and hyphens; 3 to 40 characters; no leading or trailing hyphen. */
export const AGENCY_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

export const agencySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(AGENCY_SLUG_PATTERN, 'Use 3 to 40 lowercase letters, digits or hyphens')
  .refine((slug) => !slug.includes('--'), 'Do not use two hyphens in a row')
  .refine((slug) => !(RESERVED_SLUGS as readonly string[]).includes(slug), 'This name is reserved');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const REGIONS = ['us', 'kr'] as const;

/** `POST /api/admin/v1/agencies` (FR-TEN-02, US-1602). */
export const createAgencyInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: agencySlugSchema,
  adminEmail: emailSchema,
  region: z.enum(REGIONS).default('us'),
});
export type CreateAgencyInput = z.infer<typeof createAgencyInputSchema>;

/** `POST /api/admin/v1/agencies/:id/suspend` and `/reactivate`: a reason is always recorded. */
export const agencyStatusReasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type AgencyStatusReasonInput = z.infer<typeof agencyStatusReasonSchema>;

/** `POST /api/v1/agencies/:id/invites`. */
export const inviteMemberInputSchema = z.object({
  email: emailSchema,
  role: z.enum(AGENCY_ROLES),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

/** `PATCH /api/v1/agencies/:id/members/:userId`. */
export const updateMemberInputSchema = z
  .object({ role: z.enum(AGENCY_ROLES).optional(), active: z.boolean().optional() })
  .refine((v) => v.role !== undefined || v.active !== undefined, 'Nothing to change');
export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>;

/** `PATCH /api/admin/v1/agencies/:id/budget`: the monthly AI budget in USD; null removes the limit (ADR-013). */
export const agencyBudgetInputSchema = z.object({
  aiMonthlyBudgetUsd: z.number().min(0).max(1_000_000).nullable(),
});
export type AgencyBudgetInput = z.infer<typeof agencyBudgetInputSchema>;

/** `POST /api/admin/v1/admins` (owner only, US-1603). */
export const invitePlatformAdminInputSchema = z.object({
  email: emailSchema,
  role: z.enum(['owner', 'admin', 'support']),
});
export type InvitePlatformAdminInput = z.infer<typeof invitePlatformAdminInputSchema>;

/** `PATCH /api/admin/v1/admins/:userId`. */
export const updatePlatformAdminInputSchema = z.object({
  role: z.enum(['owner', 'admin', 'support']),
});
export type UpdatePlatformAdminInput = z.infer<typeof updatePlatformAdminInputSchema>;
