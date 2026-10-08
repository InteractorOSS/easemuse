// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import type { ScopedTx } from '@/lib/db';
import type { JobContext } from '@/worker/registry';
import { SEND_MAX_ATTEMPTS } from './outbox';
import { selectTransport } from './transport';
import { PermanentSendError, type Transport } from './transport-core';

const dataSchema = z.object({ outboxMessageId: z.guid() });

/** Statuses that are final: re-running the job must not deliver again. */
const FINAL = new Set(['sent', 'captured', 'suppressed', 'bounced', 'failed']);

export interface SendDeps {
  /** Loads the transport; injectable for tests and for the mailbox transport. */
  transportFor?: (agencySettings: unknown) => Transport;
}

/** A touch whose email never went out shows as failed, so the recruiter can try another way (ADR-009). */
async function failTouch(ctx: JobContext, outboxMessageId: string): Promise<void> {
  await ctx.withAgency((tx: ScopedTx) =>
    tx.outreachTouch.updateMany({
      where: { outboxMessageId, status: 'sent' },
      data: { status: 'failed' },
    }),
  );
}

/**
 * `messaging.send`: delivers one outbox message (ADR-009). Idempotent (a finished message is left
 * alone), re-checks suppression for outreach, and records every attempt. After the last attempt the
 * message is marked failed so the UI can show it; earlier failures stay queued for the retry.
 */
export async function sendOutboxMessage(ctx: JobContext, deps: SendDeps = {}): Promise<void> {
  const parsed = dataSchema.safeParse(ctx.data);
  if (!parsed.success) throw new UnrecoverableError('invalid_send_payload');
  const { outboxMessageId } = parsed.data;

  const loaded = await ctx.withAgency(async (tx: ScopedTx) => {
    const message = await tx.outboxMessage.findUnique({ where: { id: outboxMessageId } });
    if (!message) return null;
    const agency = await tx.agency.findUnique({
      where: { id: message.agencyId },
      select: { settings: true, name: true },
    });
    const sender = message.senderId
      ? await tx.user.findUnique({
          where: { id: message.senderId },
          select: { name: true, email: true },
        })
      : null;
    const suppressed =
      message.kind === 'outreach' &&
      (await tx.suppression.findUnique({
        where: { agencyId_address: { agencyId: message.agencyId, address: message.toAddress } },
      })) !== null;
    return {
      message,
      settings: agency?.settings ?? null,
      agencyName: agency?.name ?? null,
      sender,
      suppressed,
    };
  });
  if (!loaded) throw new UnrecoverableError('outbox_message_not_found');
  const { message } = loaded;
  if (FINAL.has(message.status)) return;

  if (loaded.suppressed) {
    await ctx.withAgency((tx) =>
      tx.outboxMessage.update({ where: { id: message.id }, data: { status: 'suppressed' } }),
    );
    await failTouch(ctx, message.id);
    return;
  }

  await ctx.withAgency((tx) =>
    tx.outboxMessage.update({
      where: { id: message.id },
      data: { status: 'sending', attempts: { increment: 1 } },
    }),
  );
  const transport = (deps.transportFor ?? selectTransport)(loaded.settings);
  try {
    const outcome = await transport.send({
      ...message,
      senderName: loaded.sender?.name ?? null,
      senderEmail: loaded.sender?.email ?? null,
      agencyName: loaded.agencyName,
    });
    await ctx.withAgency((tx) =>
      tx.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: outcome.status,
          transport:
            outcome.status === 'sent' ? (outcome.transport ?? transport.name) : transport.name,
          lastError: null,
          sentAt: outcome.status === 'sent' ? new Date() : null,
          ...(outcome.status === 'sent'
            ? {
                providerMessageId: outcome.providerId ?? null,
                providerThreadId: outcome.threadId ?? null,
              }
            : {}),
        },
      }),
    );
  } catch (error) {
    const text = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    // A failure retrying cannot fix ends the message now.
    const permanent = error instanceof PermanentSendError;
    const last = permanent || ctx.attempt >= SEND_MAX_ATTEMPTS;
    await ctx.withAgency((tx) =>
      tx.outboxMessage.update({
        where: { id: message.id },
        data: { status: last ? 'failed' : 'queued', lastError: text },
      }),
    );
    if (last) await failTouch(ctx, message.id);
    throw permanent ? new UnrecoverableError(text) : error;
  }
}
