// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createSmtpTransport, smtpConfigFromEnv, type SmtpConfig } from './smtp';
import { PermanentSendError, type Transport, type TransportName } from './transport-core';

export {
  PermanentSendError,
  type OutgoingMessage,
  type SendOutcome,
  type Transport,
  type TransportName,
} from './transport-core';

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

/** What `selectTransport` may use besides the setting: tests and the worker pass their own. */
export interface TransportDeps {
  /** SMTP settings, or null when the server has none. Defaults to the environment. */
  smtp?: SmtpConfig | null;
  /** The mailbox transport (Gmail or Microsoft 365 through Interactor credentials). */
  mailbox?: Transport;
}

/** A transport that cannot work here; every send fails at once and says why. */
function unavailable(name: TransportName, reason: string): Transport {
  return {
    name,
    async send() {
      throw new PermanentSendError(reason);
    },
  };
}

/**
 * Chooses the transport from the agency setting `emailTransport` (ADR-009). Capture is the default.
 * Asking for a real transport that is not available here fails each send with a clear reason: a
 * message is never reported as sent when nothing left the system.
 */
export function selectTransport(agencySettings: unknown, deps: TransportDeps = {}): Transport {
  const requested =
    agencySettings && typeof agencySettings === 'object'
      ? (agencySettings as Record<string, unknown>).emailTransport
      : undefined;
  if (requested === 'smtp') {
    const config = deps.smtp === undefined ? smtpConfigFromEnv() : deps.smtp;
    return config
      ? createSmtpTransport(config)
      : unavailable('smtp', 'SMTP is not configured on this server');
  }
  if (requested === 'mailbox') {
    return (
      deps.mailbox ?? unavailable('mailbox', 'Connecting a mailbox is not available on this server')
    );
  }
  return requested === 'log-only' ? createLogOnlyTransport() : devCaptureTransport;
}
