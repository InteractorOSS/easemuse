// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/lib/db/client';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { listOutbox } from './outbox-list';
import { applyUnsubscribe } from './unsubscribe';

describe.skipIf(!dbAvailable())('opt-out and outbox list (T-5-03, T-5-04)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let a: string;
  let b: string;
  let user: string;
  const inA = <T>(
    fn: Parameters<ReturnType<typeof appScope>['withAgency']>[1] & ((tx: never) => Promise<T>),
  ) => appScope(handle).withAgency(a, fn as never) as Promise<T>;

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    a = await createAgency(admin, 'Unsub A');
    b = await createAgency(admin, 'Unsub B');
    user = await createUser(admin);
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [a, b] });
    await admin.end();
    await handle.close();
  });

  it('suppresses the address and marks matching candidates do-not-contact, once', async () => {
    const email = `opt-${randomUUID().slice(0, 6)}@example.com`;
    const make = (agencyId: string) =>
      admin.query(
        `INSERT INTO "Candidate" (id, "agencyId", "fullName", email, source, "createdById", "updatedAt") VALUES (gen_random_uuid(), $1, 'Opt Out', $2, 'linkedin', $3, now())`,
        [agencyId, email.toUpperCase(), user],
      );
    await make(a);
    await make(b);
    await appScope(handle).withAgency(a, (tx) => applyUnsubscribe(tx, a, email));
    await appScope(handle).withAgency(a, (tx) => applyUnsubscribe(tx, a, email));
    const sup = await admin.query(
      `SELECT "agencyId", reason FROM "Suppression" WHERE address = $1`,
      [email],
    );
    expect(sup.rows).toEqual([{ agencyId: a, reason: 'opted_out' }]);
    const flags = await admin.query(
      `SELECT "agencyId", "doNotContact" FROM "Candidate" WHERE lower(email) = $1`,
      [email],
    );
    expect(Object.fromEntries(flags.rows.map((r) => [r.agencyId, r.doNotContact]))).toEqual({
      [a]: true,
      [b]: false,
    });
  });

  it('lists the outbox newest first with a status filter and pages', async () => {
    for (let i = 0; i < 5; i++) {
      await admin.query(
        `INSERT INTO "OutboxMessage" (id, "agencyId", "toAddress", subject, "bodyHtml", "bodyText", kind, transport, status, "updatedAt", "createdAt") VALUES (gen_random_uuid(), $1, $2, $3, '', 'x', 'outreach', 'dev-capture', $4::"OutboxStatus", now(), now() + ($5 || ' seconds')::interval)`,
        [a, `x${i}@example.com`, `S${i}`, i % 2 ? 'failed' : 'captured', String(i)],
      );
    }
    const first = await inA((tx) => listOutbox(tx, { limit: 2 }));
    expect(first.items.map((m) => m.subject)).toEqual(['S4', 'S3']);
    const second = await inA((tx) => listOutbox(tx, { limit: 2, cursor: first.nextCursor! }));
    expect(second.items.map((m) => m.subject)).toEqual(['S2', 'S1']);
    const failed = await inA((tx) => listOutbox(tx, { limit: 10, status: 'failed' }));
    expect(failed.items.map((m) => m.subject)).toEqual(['S3', 'S1']);
    const other = await appScope(handle).withAgency(b, (tx) => listOutbox(tx, { limit: 10 }));
    expect(other.items).toEqual([]);
  });
});
