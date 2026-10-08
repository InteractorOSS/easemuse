// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { REPLY_WATCH_DAYS } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { CredentialsError, type CredentialsClient } from '@/lib/interactor/credentials';
import { noteReply } from '@/server/outreach/replies';
import { ProviderAuthError, type MailProvider } from './providers/types';

/** Threads looked at per mailbox in one run, so one busy mailbox cannot starve the others. */
const MAX_THREADS_PER_RUN = 60;
const DAY = 24 * 60 * 60 * 1000;

export interface ReplySyncDeps {
  agencyIds(): Promise<string[]>;
  withAgency<T>(agencyId: string, fn: (tx: ScopedTx) => Promise<T>): Promise<T>;
  credentials: Pick<CredentialsClient, 'getAccessToken'>;
  providers: Record<'google' | 'microsoft', MailProvider>;
  now?: () => Date;
  log?(message: string, data: Record<string, unknown>): void;
}

export interface ReplySyncSummary {
  mailboxes: number;
  threadsChecked: number;
  replies: number;
  needReconnect: number;
}

/**
 * Looks for replies to sent outreach in every connected mailbox (T-5-12, FR-MSG-04, US-505): for each
 * sent touch with no answer yet, the conversation is read at the provider, and a message from someone
 * other than the recruiter, after the send, counts as a reply. Only the sender, address and time of
 * a message are read, never its content. A mailbox whose sign-in stopped working is marked so the
 * recruiter is asked to connect again.
 */
export async function runReplySync(deps: ReplySyncDeps): Promise<ReplySyncSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => undefined);
  const summary: ReplySyncSummary = {
    mailboxes: 0,
    threadsChecked: 0,
    replies: 0,
    needReconnect: 0,
  };

  for (const agencyId of await deps.agencyIds()) {
    const connections = await deps.withAgency(agencyId, (tx) =>
      tx.mailConnection.findMany({ where: { status: 'active' } }),
    );
    for (const connection of connections) {
      summary.mailboxes += 1;
      const watch = await deps.withAgency(agencyId, async (tx) => {
        const messages = await tx.outboxMessage.findMany({
          where: {
            senderId: connection.userId,
            kind: 'outreach',
            status: 'sent',
            providerThreadId: { not: null },
            sentAt: { gte: new Date(now.getTime() - REPLY_WATCH_DAYS * DAY) },
          },
          select: { id: true, providerThreadId: true, sentAt: true },
          orderBy: { sentAt: 'desc' },
          take: MAX_THREADS_PER_RUN,
        });
        const touches = messages.length
          ? await tx.outreachTouch.findMany({
              where: {
                outboxMessageId: { in: messages.map((m) => m.id) },
                status: 'sent',
                response: null,
              },
              select: { id: true, outboxMessageId: true },
            })
          : [];
        const byMessage = new Map(touches.map((t) => [t.outboxMessageId, t.id]));
        return messages.flatMap((m) => {
          const touchId = byMessage.get(m.id);
          return touchId && m.providerThreadId && m.sentAt
            ? [{ touchId, threadId: m.providerThreadId, sentAt: m.sentAt }]
            : [];
        });
      });
      if (watch.length === 0) continue;

      const provider = deps.providers[connection.provider as 'google' | 'microsoft'];
      try {
        const token = await deps.credentials.getAccessToken(connection.credentialId);
        const own = connection.address.toLowerCase();
        for (const item of watch) {
          summary.threadsChecked += 1;
          const thread = await provider.listThread(token, item.threadId);
          const reply = thread.find(
            (m) => m.from !== '' && m.from !== own && m.receivedAt > item.sentAt,
          );
          if (!reply) continue;
          const noted = await deps.withAgency(agencyId, (tx) =>
            noteReply(tx, { agencyId, touchId: item.touchId }, now),
          );
          if (noted) summary.replies += 1;
        }
        await deps.withAgency(agencyId, (tx) =>
          tx.mailConnection.update({ where: { id: connection.id }, data: { lastSyncAt: now } }),
        );
      } catch (error) {
        const authProblem =
          error instanceof ProviderAuthError ||
          (error instanceof CredentialsError && [401, 403, 404].includes(error.status ?? 0));
        if (authProblem) {
          summary.needReconnect += 1;
          await deps.withAgency(agencyId, (tx) =>
            tx.mailConnection.update({
              where: { id: connection.id },
              data: { status: 'needs_reconnect' },
            }),
          );
        }
        log('mailbox.sync_failed', {
          agencyId,
          connectionId: connection.id,
          reason: authProblem ? 'needs_reconnect' : (error as Error).message,
        });
      }
    }
  }
  return summary;
}
