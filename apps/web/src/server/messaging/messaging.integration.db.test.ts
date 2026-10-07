// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DbHandle } from '@/lib/db/client';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import type { JobContext } from '@/worker/registry';
import { createOutboxMessage } from './outbox';
import { sendOutboxMessage } from './send';
import type { Transport } from './transport';

describe.skipIf(!dbAvailable())('outbox and messaging.send (RLS)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let scope: ReturnType<typeof appScope>;
  let agencyId: string;

  const msg = (overrides: Partial<Parameters<typeof createOutboxMessage>[1]> = {}) => ({
    agencyId,
    senderId: null,
    toAddress: 'Person@Example.test',
    subject: 'Hello',
    bodyText: 'text',
    bodyHtml: '<p>text</p>',
    kind: 'member_invite' as const,
    ...overrides,
  });

  const ctxFor = (outboxMessageId: string, attempt = 1): JobContext => ({
    jobRunId: randomUUID(),
    agencyId,
    requestedById: null,
    data: { outboxMessageId },
    attempt,
    withAgency: (fn) => scope.withAgency(agencyId, fn),
    progress: async () => undefined,
  });

  const status = async (id: string) =>
    await scope.withAgency(agencyId, (tx) => tx.outboxMessage.findUniqueOrThrow({ where: { id } }));

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    scope = appScope(handle);
    agencyId = await createAgency(admin, 'Mail');
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('queues a message with a lowercased address and the chosen transport', async () => {
    const { id, suppressed } = await scope.withAgency(agencyId, (tx) =>
      createOutboxMessage(tx, msg()),
    );
    expect(suppressed).toBe(false);
    expect(await status(id)).toMatchObject({
      status: 'queued',
      toAddress: 'person@example.test',
      transport: 'dev-capture',
    });
  });

  it('delivers through dev-capture: marks captured, records the attempt, and is idempotent', async () => {
    const { id } = await scope.withAgency(agencyId, (tx) => createOutboxMessage(tx, msg()));
    await sendOutboxMessage(ctxFor(id));
    expect(await status(id)).toMatchObject({
      status: 'captured',
      attempts: 1,
      lastError: null,
      sentAt: null,
    });
    await sendOutboxMessage(ctxFor(id));
    expect((await status(id)).attempts).toBe(1);
  });

  it('marks sent with a timestamp when the transport reports delivery', async () => {
    const { id } = await scope.withAgency(agencyId, (tx) => createOutboxMessage(tx, msg()));
    const transport: Transport = {
      name: 'smtp',
      send: vi.fn(async () => ({ status: 'sent' as const, providerId: 'p1' })),
    };
    await sendOutboxMessage(ctxFor(id), { transportFor: () => transport });
    expect(await status(id)).toMatchObject({ status: 'sent', transport: 'smtp' });
    expect((await status(id)).sentAt).toBeInstanceOf(Date);
  });

  it('keeps the message queued for a retry on early failures and marks it failed after the last attempt', async () => {
    const { id } = await scope.withAgency(agencyId, (tx) => createOutboxMessage(tx, msg()));
    const failing: Transport = {
      name: 'smtp',
      send: async () => {
        throw new Error('smtp down');
      },
    };
    await expect(sendOutboxMessage(ctxFor(id, 1), { transportFor: () => failing })).rejects.toThrow(
      'smtp down',
    );
    expect(await status(id)).toMatchObject({ status: 'queued', lastError: 'smtp down' });
    await expect(sendOutboxMessage(ctxFor(id, 5), { transportFor: () => failing })).rejects.toThrow(
      'smtp down',
    );
    expect(await status(id)).toMatchObject({
      status: 'failed',
      lastError: 'smtp down',
      attempts: 2,
    });
  });

  it('refuses outreach to a suppressed address, at enqueue and again at send, but not system email', async () => {
    await scope.withAgency(agencyId, (tx) =>
      tx.suppression.create({
        data: { agencyId, address: 'optout@example.test', reason: 'opted_out' },
      }),
    );
    const refused = await scope.withAgency(agencyId, (tx) =>
      createOutboxMessage(tx, msg({ kind: 'outreach', toAddress: 'OptOut@example.test' })),
    );
    expect(refused.suppressed).toBe(true);
    expect((await status(refused.id)).status).toBe('suppressed');

    const system = await scope.withAgency(agencyId, (tx) =>
      createOutboxMessage(tx, msg({ kind: 'member_invite', toAddress: 'optout@example.test' })),
    );
    expect(system.suppressed).toBe(false);

    // Suppressed AFTER queueing: caught at send time.
    const later = await scope.withAgency(agencyId, (tx) =>
      createOutboxMessage(tx, msg({ kind: 'outreach', toAddress: 'late@example.test' })),
    );
    await scope.withAgency(agencyId, (tx) =>
      tx.suppression.create({
        data: { agencyId, address: 'late@example.test', reason: 'opted_out' },
      }),
    );
    const transport: Transport = {
      name: 'smtp',
      send: vi.fn(async () => ({ status: 'sent' as const })),
    };
    await sendOutboxMessage(ctxFor(later.id), { transportFor: () => transport });
    expect(transport.send).not.toHaveBeenCalled();
    expect((await status(later.id)).status).toBe('suppressed');
  });

  it('fails permanently for a missing message or a bad payload', async () => {
    await expect(sendOutboxMessage(ctxFor(randomUUID()))).rejects.toThrow(/not_found/);
    await expect(sendOutboxMessage({ ...ctxFor(randomUUID()), data: { nope: 1 } })).rejects.toThrow(
      /invalid_send_payload/,
    );
  });
});
