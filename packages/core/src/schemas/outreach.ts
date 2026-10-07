// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** Channels of brief 7.2. Only email is sent by the system; the rest are copied and marked sent. */
export const OUTREACH_CHANNELS = ['linkedin', 'email', 'text', 'phone'] as const;
export type OutreachChannelValue = (typeof OUTREACH_CHANNELS)[number];

/** Touches of brief 7.2: 1 initial introduction, 2 follow-up, 3 final follow-up. */
export const TOUCH_NUMBERS = [1, 2, 3] as const;
export type TouchNumber = (typeof TOUCH_NUMBERS)[number];

/** Length of a message by channel, in characters (a phone touch is a call script). */
export const CHANNEL_LIMITS: Record<OutreachChannelValue, number> = {
  linkedin: 600,
  email: 1800,
  text: 320,
  phone: 900,
};

/** What a message may mention (brief 7.3). The reason for contact is always included. */
export const OUTREACH_ELEMENTS = [
  'keyAppeal',
  'company',
  'growth',
  'impact',
  'compensation',
  'location',
  'nextStep',
] as const;
export type OutreachElement = (typeof OUTREACH_ELEMENTS)[number];

export const outreachIncludeSchema = z.object(
  Object.fromEntries(OUTREACH_ELEMENTS.map((k) => [k, z.boolean().default(true)])) as Record<
    OutreachElement,
    z.ZodDefault<z.ZodBoolean>
  >,
);
export type OutreachInclude = z.infer<typeof outreachIncludeSchema>;

export const OUTREACH_RESPONSES = [
  'interested',
  'not_interested',
  'not_now',
  'referred',
  'no_response',
] as const;
export type OutreachResponse = (typeof OUTREACH_RESPONSES)[number];

/** Replies that end the sequence: the remaining touches are cancelled (FR-OUT-05). */
export const SEQUENCE_ENDING_RESPONSES: readonly OutreachResponse[] = [
  'interested',
  'not_interested',
  'not_now',
  'referred',
];

/** `PUT /pipeline/:id/sequence`: the channel and the days between touches. */
export const sequenceInputSchema = z.object({
  channel: z.enum(OUTREACH_CHANNELS),
  intervalsDays: z
    .tuple([z.number().int().min(1).max(60), z.number().int().min(1).max(60)])
    .optional(),
});
export type SequenceInput = z.infer<typeof sequenceInputSchema>;

/** `POST /pipeline/:id/touches/:n/draft` */
export const draftInputSchema = z.object({
  include: outreachIncludeSchema.default(() => outreachIncludeSchema.parse({})),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

/** `POST /touches/:n/send` and `/mark-sent`: the approved version that goes out. */
export const sendInputSchema = z.object({ versionId: z.guid() });
export type SendInput = z.infer<typeof sendInputSchema>;

export const responseInputSchema = z.object({
  response: z.enum(OUTREACH_RESPONSES),
  /** Which touch the reply came to; defaults to the latest one sent. */
  touchNumber: z.number().int().min(1).max(3).optional(),
  /** "Not interested" moves the candidate, which needs a reason from the agency's list. */
  reasonCode: z.string().trim().min(2).max(60).optional(),
  reason: z.string().trim().min(3).max(500).optional(),
});
export type ResponseInput = z.infer<typeof responseInputSchema>;

/** Placeholders kept in drafts so the model never sees a name; filled in when previewing and sending. */
export const OUTREACH_TOKENS = {
  firstName: '{{first_name}}',
  recruiter: '{{recruiter_name}}',
} as const;

export function fillOutreachTokens(
  text: string,
  values: { firstName: string; recruiter: string },
): string {
  return text
    .split(OUTREACH_TOKENS.firstName)
    .join(values.firstName)
    .split(OUTREACH_TOKENS.recruiter)
    .join(values.recruiter);
}

/** Delivery states of an outbox message. Mirrors the Prisma `OutboxStatus` enum. */
export const OUTBOX_STATUSES = [
  'queued',
  'sending',
  'sent',
  'failed',
  'captured',
  'suppressed',
  'bounced',
] as const;
export type OutboxStatusValue = (typeof OUTBOX_STATUSES)[number];
