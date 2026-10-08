// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  MAILBOX_SCOPES,
  type MailboxProvider,
  type MailboxStatus,
  type RecordMailboxInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden } from '@/lib/http/errors';
import { getEnv } from '@/lib/env';
import { logActivity } from '@/server/activity/service';
import {
  CredentialsError,
  createCredentialsClient,
  type CredentialsClient,
} from '@/lib/interactor/credentials';
import { createGmailProvider } from './providers/gmail';
import { createGraphProvider } from './providers/graph';
import { ProviderAuthError, ProviderHttpError, type MailProvider } from './providers/types';
import { PermanentSendError, type Transport } from './transport-core';

/**
 * A recruiter's connected mailbox (T-5-12, US-505, ADR-009). The sign-in, token storage and token
 * refresh are Interactor's (credentials service); this module starts the sign-in, records the result
 * and sends mail with the token Interactor hands out. Nothing here keeps a token.
 */
export interface MailboxView {
  provider: MailboxProvider;
  address: string;
  status: MailboxStatus;
  lastSyncAt: Date | null;
}

export interface MailboxDeps {
  credentials: CredentialsClient;
  providers: Record<MailboxProvider, MailProvider>;
  serviceIds: Record<MailboxProvider, string>;
}

/** The Interactor service ids; the defaults are the likely names, set the env vars to the real ones. */
export function mailboxDepsFromEnv(): MailboxDeps {
  const env = getEnv();
  return {
    credentials: createCredentialsClient(),
    providers: { google: createGmailProvider(), microsoft: createGraphProvider() },
    serviceIds: {
      google: env.MAILBOX_GOOGLE_SERVICE_ID ?? 'gmail',
      microsoft: env.MAILBOX_MICROSOFT_SERVICE_ID ?? 'outlook',
    },
  };
}

/** The person Interactor knows the connection by: ours, scoped to the agency. */
export const externalUserId = (agencyId: string, userId: string) =>
  `easemuse:${agencyId}:${userId}`;

export async function getMyMailbox(tx: ScopedTx, userId: string): Promise<MailboxView | null> {
  const row = await tx.mailConnection.findFirst({ where: { userId } });
  return row
    ? {
        provider: row.provider as MailboxProvider,
        address: row.address,
        status: row.status as MailboxStatus,
        lastSyncAt: row.lastSyncAt,
      }
    : null;
}

/** Step 1: where to send the person to sign in at Google or Microsoft. */
export async function startMailboxConnection(
  deps: MailboxDeps,
  input: { agencyId: string; userId: string; provider: MailboxProvider; returnUrl: string },
): Promise<{ authorizationUrl: string }> {
  try {
    const flow = await deps.credentials.initiateOAuth({
      serviceId: deps.serviceIds[input.provider],
      externalUserId: externalUserId(input.agencyId, input.userId),
      scopes: MAILBOX_SCOPES[input.provider],
      successRedirectUrl: `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}provider=${input.provider}`,
    });
    return { authorizationUrl: flow.authorizationUrl };
  } catch (error) {
    if (error instanceof CredentialsError) {
      throw new ApiError('unavailable', 'The mailbox service could not be reached. Try again.', {
        status: 503,
      });
    }
    throw error;
  }
}

/**
 * Step 2: the person is back from signing in. The credential must be theirs (Interactor reports who
 * it belongs to) and for the right service; the address is read from the mailbox itself.
 */
export async function recordMailbox(
  tx: ScopedTx,
  deps: MailboxDeps,
  input: { agencyId: string; userId: string } & RecordMailboxInput,
): Promise<MailboxView> {
  let credential;
  let address: string;
  try {
    credential = await deps.credentials.getCredential(input.credentialId);
    if (
      credential.externalUserId !== externalUserId(input.agencyId, input.userId) ||
      credential.serviceId !== deps.serviceIds[input.provider]
    ) {
      throw forbidden('This mailbox connection is not yours');
    }
    if (credential.status !== 'active') {
      throw new ApiError('conflict', 'The sign-in was not completed. Connect again.', {
        status: 409,
      });
    }
    const token = await deps.credentials.getAccessToken(input.credentialId);
    address = await deps.providers[input.provider].address(token);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof CredentialsError || error instanceof ProviderHttpError) {
      throw new ApiError('unavailable', 'The mailbox could not be checked. Try again.', {
        status: 503,
      });
    }
    if (error instanceof ProviderAuthError) {
      throw new ApiError(
        'conflict',
        'The mail provider did not accept the sign-in. Connect again.',
        {
          status: 409,
        },
      );
    }
    throw error;
  }
  const row = await tx.mailConnection.upsert({
    where: { agencyId_userId: { agencyId: input.agencyId, userId: input.userId } },
    create: {
      agencyId: input.agencyId,
      userId: input.userId,
      provider: input.provider,
      credentialId: input.credentialId,
      address,
    },
    update: {
      provider: input.provider,
      credentialId: input.credentialId,
      address,
      status: 'active',
    },
  });
  await logActivity(tx, {
    agencyId: input.agencyId,
    actor: { type: 'user', id: input.userId },
    action: 'mailbox.connected',
    entityType: 'user',
    entityId: input.userId,
    data: { provider: input.provider },
  });
  return {
    provider: row.provider as MailboxProvider,
    address: row.address,
    status: row.status as MailboxStatus,
    lastSyncAt: row.lastSyncAt,
  };
}

/** Disconnects: the credential is deleted at Interactor (tokens revoked) and our record removed. */
export async function disconnectMailbox(
  tx: ScopedTx,
  deps: Pick<MailboxDeps, 'credentials'>,
  input: { agencyId: string; userId: string },
): Promise<void> {
  const row = await tx.mailConnection.findFirst({ where: { userId: input.userId } });
  if (!row) return;
  await deps.credentials.deleteCredential(row.credentialId).catch((error: unknown) => {
    // Already gone at Interactor is fine; anything else must not leave a live token behind.
    if (!(error instanceof CredentialsError && error.status === 404)) throw error;
  });
  await tx.mailConnection.delete({ where: { id: row.id } });
  await logActivity(tx, {
    agencyId: input.agencyId,
    actor: { type: 'user', id: input.userId },
    action: 'mailbox.disconnected',
    entityType: 'user',
    entityId: input.userId,
    data: { provider: row.provider },
  });
}

export interface MailboxStore {
  find(
    agencyId: string,
    userId: string,
  ): Promise<{
    provider: MailboxProvider;
    credentialId: string;
    address: string;
    status: MailboxStatus;
  } | null>;
  markNeedsReconnect(agencyId: string, userId: string): Promise<void>;
}

const RECONNECT = 'Your mailbox needs to be connected again (Settings, Mailbox)';

/**
 * The transport for agencies that send from each recruiter's own mailbox. It looks up the sender's
 * connection per message; no connection, or one that needs signing in again, fails the send at once
 * with a message the recruiter can act on (ADR-009: a message is never reported sent when it was not).
 */
export function createMailboxTransport(
  store: MailboxStore,
  deps: Pick<MailboxDeps, 'credentials' | 'providers'>,
): Transport {
  return {
    name: 'mailbox',
    async send(message) {
      if (!message.senderId) {
        throw new PermanentSendError('This message has no sender to send it from');
      }
      const connection = await store.find(message.agencyId, message.senderId);
      if (!connection) {
        throw new PermanentSendError('Connect your mailbox first (Settings, Mailbox)');
      }
      if (connection.status !== 'active') throw new PermanentSendError(RECONNECT);
      const provider = deps.providers[connection.provider];
      const reconnect = async (): Promise<never> => {
        await store.markNeedsReconnect(message.agencyId, message.senderId!);
        throw new PermanentSendError(RECONNECT);
      };
      try {
        const token = await deps.credentials.getAccessToken(connection.credentialId);
        const sent = await provider.send(token, {
          to: message.toAddress,
          subject: message.subject,
          text: message.bodyText,
          html: message.bodyHtml,
          replyTo: connection.address,
        });
        return {
          status: 'sent',
          providerId: sent.messageId,
          threadId: sent.threadId,
          transport: provider.name,
        };
      } catch (error) {
        if (error instanceof ProviderAuthError) return reconnect();
        if (
          error instanceof CredentialsError &&
          error.status &&
          [401, 403, 404].includes(error.status)
        ) {
          return reconnect();
        }
        if (error instanceof ProviderHttpError && !error.transient) {
          throw new PermanentSendError(`The mail provider rejected the message (${error.status})`);
        }
        throw error;
      }
    },
  };
}
