// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/**
 * A recruiter's own mailbox (T-5-12, US-505, ADR-009): outreach goes out from their Gmail or Microsoft
 * 365 account, and replies to it are noticed. The mailbox is connected through Interactor's credential
 * service; we keep only the credential id and the address, never the tokens.
 */
export const MAILBOX_PROVIDERS = ['google', 'microsoft'] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];

export const MAILBOX_STATUSES = ['active', 'needs_reconnect'] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

/** `POST /mailbox/connect`: start connecting; the answer is where to send the person to sign in. */
export const connectMailboxInputSchema = z.object({ provider: z.enum(MAILBOX_PROVIDERS) });
export type ConnectMailboxInput = z.infer<typeof connectMailboxInputSchema>;

/** `POST /mailbox`: the person came back from signing in; record the credential Interactor made. */
export const recordMailboxInputSchema = z.object({
  provider: z.enum(MAILBOX_PROVIDERS),
  credentialId: z.string().trim().min(1).max(200),
});
export type RecordMailboxInput = z.infer<typeof recordMailboxInputSchema>;

/** The OAuth scopes asked for, least needed: send as the person, and read the replies to those sends. */
export const MAILBOX_SCOPES: Record<MailboxProvider, string[]> = {
  google: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  microsoft: ['offline_access', 'User.Read', 'Mail.Send', 'Mail.ReadWrite'],
};

/** How long after sending a reply is looked for. */
export const REPLY_WATCH_DAYS = 30;
