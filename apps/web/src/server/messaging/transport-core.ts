// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** The slice of an OutboxMessage a transport needs, plus who is sending it. */
export interface OutgoingMessage {
  id: string;
  agencyId: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  /** The recruiter the message is from; null for system mail such as invitations. */
  senderId?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  agencyName?: string | null;
}

export type SendOutcome =
  | {
      status: 'sent';
      providerId?: string;
      /** The conversation the message started at the provider, to match replies to it (T-5-12). */
      threadId?: string;
      /** The transport that really delivered it, when one transport serves several (a connected mailbox). */
      transport?: 'gmail' | 'graph';
    }
  | { status: 'captured' };

export type TransportName = 'dev-capture' | 'log-only' | 'smtp' | 'mailbox' | 'gmail' | 'graph';

/**
 * A failure that retrying cannot fix (a rejected recipient, a refused login, a transport that is not
 * configured). The send job marks the message failed at once instead of trying five times.
 */
export class PermanentSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSendError';
  }
}

/** Delivery backend (ADR-009). Features enqueue messages and never know which transport runs. */
export interface Transport {
  readonly name: TransportName;
  send(message: OutgoingMessage): Promise<SendOutcome>;
}
