// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** The slice of an OutboxMessage a transport needs. */
export interface OutgoingMessage {
  id: string;
  agencyId: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export type SendOutcome = { status: 'sent'; providerId?: string } | { status: 'captured' };

/** Delivery backend (ADR-009). Features enqueue messages and never know which transport runs. */
export interface Transport {
  readonly name: 'dev-capture' | 'log-only' | 'smtp';
  send(message: OutgoingMessage): Promise<SendOutcome>;
}

/** Stores only: the row already holds the message, nothing leaves the system ("Test mode"). */
export const devCaptureTransport: Transport = {
  name: 'dev-capture',
  async send() {
    return { status: 'captured' };
  },
};

/** Like dev-capture, and writes a log line without the body (no personal data in logs). */
export function createLogOnlyTransport(log: (line: string) => void = console.log): Transport {
  return {
    name: 'log-only',
    async send(message) {
      log(
        `[mail] captured message ${message.id} for agency ${message.agencyId} (subject length ${message.subject.length})`,
      );
      return { status: 'captured' };
    },
  };
}

/**
 * Chooses the transport from the agency setting `emailTransport` (ADR-009). SMTP and the provider
 * transports are not built yet (T-5-02), so everything resolves to a capture transport; asking for
 * an unavailable one falls back to capture rather than failing sends.
 */
export function selectTransport(agencySettings: unknown): Transport {
  const requested =
    agencySettings && typeof agencySettings === 'object'
      ? (agencySettings as Record<string, unknown>).emailTransport
      : undefined;
  return requested === 'log-only' ? createLogOnlyTransport() : devCaptureTransport;
}
