// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { FEEDBACK_CRITERIA, FEEDBACK_RATINGS } from './interviews';
import { PRIVACY_KINDS } from './privacy';
import { CONSENT_ACTIONS } from './consent';

/** `POST /shares/:id/approve` and `/request-changes`: a decision on the JD (hiring manager) or the resume (candidate). */
export const portalDecisionInputSchema = z.object({
  comments: z.string().trim().max(2000).optional(),
});
export type PortalDecisionInput = z.infer<typeof portalDecisionInputSchema>;

/** What a hiring manager can propose about a submitted candidate (FR-HMP-05). The recruiter confirms. */
export const HM_DECISIONS = ['interview', 'hold', 'reject'] as const;
export type HmDecision = (typeof HM_DECISIONS)[number];

export const hmDecisionInputSchema = z
  .object({
    decision: z.enum(HM_DECISIONS),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((v) => v.decision === 'interview' || Boolean(v.reason), {
    message: 'Say why',
    path: ['reason'],
  });
export type HmDecisionInput = z.infer<typeof hmDecisionInputSchema>;

/** Structured feedback from the hiring manager on the latest interview round (FR-IVW-03). */
export const hmFeedbackInputSchema = z
  .object({
    ratings: z.object(
      Object.fromEntries(
        FEEDBACK_CRITERIA.map((k) => [k, z.enum(FEEDBACK_RATINGS).nullish()]),
      ) as Record<
        (typeof FEEDBACK_CRITERIA)[number],
        z.ZodOptional<
          z.ZodNullable<z.ZodEnum<{ strong: 'strong'; moderate: 'moderate'; gap: 'gap' }>>
        >
      >,
    ),
    comments: z.string().trim().max(4000).optional(),
  })
  .refine((v) => Object.values(v.ratings).some(Boolean) || Boolean(v.comments), {
    message: 'Give at least one rating or a comment',
    path: ['comments'],
  });
export type HmFeedbackInput = z.infer<typeof hmFeedbackInputSchema>;

/** The candidate gives or withdraws consent to be submitted to a client they have been put forward to (FR-CDP-03). */
export const portalConsentInputSchema = z.object({
  clientId: z.guid(),
  action: z.enum(CONSENT_ACTIONS),
});
export type PortalConsentInput = z.infer<typeof portalConsentInputSchema>;

/** The candidate asks for a copy of their data or for deletion (FR-CDP-06). */
export const portalPrivacyInputSchema = z.object({
  kind: z.enum(PRIVACY_KINDS),
  note: z.string().trim().max(1000).optional(),
});
export type PortalPrivacyInput = z.infer<typeof portalPrivacyInputSchema>;

/** `POST /proposed-transitions/:id/resolve` (recruiter). */
export const resolveProposalInputSchema = z.object({
  accept: z.boolean(),
  /** Needed to accept a rejection: a reason from the agency's list (the pipeline asks for it). */
  reasonCode: z.string().trim().min(2).max(60).optional(),
});
export type ResolveProposalInput = z.infer<typeof resolveProposalInputSchema>;
