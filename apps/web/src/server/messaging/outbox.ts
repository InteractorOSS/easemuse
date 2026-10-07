// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';
import { enqueue } from '@/lib/queue/enqueue';
import { selectTransport } from './transport';

export const MESSAGE_KINDS = [
  'outreach',
  'portal_invite',
  'notification',
  'member_invite',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Retries for delivery (ADR-009): up to 5 attempts, exponential backoff from 30 s. */
export const SEND_MAX_ATTEMPTS = 5;
const SEND_BACKOFF_MS = 30_000;

export interface NewMessage {
  agencyId: string;
  senderId: string | null;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  kind: MessageKind;
  entityType?: string;
  entityId?: string;
}

/**
 * Step 1, INSIDE the caller's transaction: writes the `OutboxMessage` (queued). Outreach to a
 * suppressed address is refused here and again at send time (ADR-009, FR-MSG-05); system emails
 * such as invitations are not subject to suppression.
 */
export async function createOutboxMessage(
  tx: ScopedTx,
  message: NewMessage,
  agencySettings: unknown = null,
): Promise<{ id: string; suppressed: boolean }> {
  const to = message.toAddress.toLowerCase();
  const suppressed =
    message.kind === 'outreach' &&
    (await tx.suppression.findUnique({
      where: { agencyId_address: { agencyId: message.agencyId, address: to } },
    })) !== null;

  const row = await tx.outboxMessage.create({
    data: {
      agencyId: message.agencyId,
      senderId: message.senderId,
      toAddress: to,
      subject: message.subject,
      bodyText: message.bodyText,
      bodyHtml: message.bodyHtml,
      kind: message.kind,
      entityType: message.entityType ?? null,
      entityId: message.entityId ?? null,
      transport: selectTransport(agencySettings).name,
      status: suppressed ? 'suppressed' : 'queued',
    },
  });
  return { id: row.id, suppressed };
}

/**
 * Step 2, AFTER that transaction commits: hands the message to the `messaging` queue. Kept apart so
 * the job can never run before the row exists. The idempotency key makes a repeated call harmless.
 */
export async function dispatchOutboxMessage(input: {
  agencyId: string;
  outboxMessageId: string;
  requestedById: string | null;
}): Promise<void> {
  await enqueue({
    queue: 'messaging',
    name: 'send',
    agencyId: input.agencyId,
    requestedById: input.requestedById,
    data: { outboxMessageId: input.outboxMessageId },
    idempotencyKey: `outbox:${input.outboxMessageId}`,
    attempts: SEND_MAX_ATTEMPTS,
    backoffMs: SEND_BACKOFF_MS,
  });
}
