// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { OUTREACH_CHANNELS } from '../schemas/outreach';

/** What the model writes: a subject (email only) and the message. */
export const outreachModelOutputSchema = z.object({
  subject: z.string().trim().max(150).default(''),
  body: z.string().trim().min(1).max(4000),
});
export type OutreachModelOutput = z.infer<typeof outreachModelOutputSchema>;

/**
 * One outreach message (brief 7). The greeting and signature are placeholders (`{{first_name}}`,
 * `{{recruiter_name}}`) filled in when sent, so the model never sees the candidate's name.
 */
export const outreachMessageContentSchema = z.object({
  channel: z.enum(OUTREACH_CHANNELS),
  touchNumber: z.number().int().min(1).max(3),
  subject: z.string().max(150).default(''),
  body: z.string().trim().min(1).max(4000),
});
export type OutreachMessageContent = z.infer<typeof outreachMessageContentSchema>;
