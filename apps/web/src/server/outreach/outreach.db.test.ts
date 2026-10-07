// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_REJECTION_REASONS, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, createArtifact } from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { addCandidateToPosition } from '@/server/pipeline/service';
import { createPosition } from '@/server/positions/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import {
  getOutreach,
  markTouchSentByHand,
  planOutreachDraft,
  recordResponse,
  sendTouchEmail,
  setSequence,
} from './service';

const NOW = new Date('2026-10-07T09:00:00Z');
const DAY = 86_400_000;

describe.skipIf(!dbAvailable())('outreach (T-5-06, T-5-09, T-5-10)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let other: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);

  const newEntry = async (
    over: { email?: string | null; dnc?: boolean; state?: 'screened' } = {},
  ) => {
    const position = await run((tx) =>
      createPosition(tx, rec, { clientId, title: 'Role', location: 'Seoul' }),
    );
    await run((tx) =>
      tx.position.update({ where: { id: position.id }, data: { status: 'sourcing' } }),
    );
    const c = await run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: agency,
          fullName: 'Jane Doe',
          email:
            over.email === undefined ? `jane-${randomUUID().slice(0, 6)}@example.com` : over.email,
          source: 'linkedin',
          createdById: rec.userId,
          doNotContact: over.dnc ?? false,
        },
        select: { id: true },
      }),
    );
    const entry = await run((tx) =>
      addCandidateToPosition(tx, rec, position.id, { candidateId: c.id }),
    );
    await run((tx) =>
      tx.pipelineEntry.update({
        where: { id: entry.id },
        data: { state: 'screened', screeningClass: 'priority' },
      }),
    );
    return { ...entry, candidateId: c.id };
  };
  /** An approved message on a touch, as if the recruiter had edited and approved the AI draft. */
  const approvedMessage = async (
    entryId: string,
    touchNumber: number,
    channel: 'email' | 'linkedin' = 'email',
  ) => {
    const artifact = await run((tx) =>
      createArtifact(tx, {
        agencyId: agency,
        kind: 'outreach_message',
        subject: { type: 'pipeline_entry', id: entryId },
      }),
    );
    await run((tx) =>
      tx.outreachTouch.updateMany({
        where: { entryId, touchNumber },
        data: { artifactId: artifact.id },
      }),
    );
    const version = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: artifact.id,
        content: {
          channel,
          touchNumber,
          subject: 'A role for you',
          body: 'Hi {{first_name}}, a note about a role.\n\n{{recruiter_name}}',
        },
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await admin.query(`UPDATE "ArtifactVersion" SET status = 'approved' WHERE id = $1`, [
      version.id,
    ]);
    await admin.query(`UPDATE "Artifact" SET "approvedVersionId" = $2 WHERE id = $1`, [
      artifact.id,
      version.id,
    ]);
    return version.id;
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Outreach A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
        [agency, u],
      );
    }
    rec = { kind: 'agency', userId: u1, agencyId: agency, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Out Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('plans three touches with the default intervals (4 and 7 days) and a task for the first', async () => {
    const e = await newEntry();
    const view = await run((tx) => setSequence(tx, rec, e.id, { channel: 'email' }, NOW));
    expect(view.touches.map((t) => [t.touchNumber, t.channel, t.status])).toEqual([
      [1, 'email', 'planned'],
      [2, 'email', 'planned'],
      [3, 'email', 'planned'],
    ]);
    expect(view.touches.map((t) => t.dueAt?.getTime())).toEqual([
      NOW.getTime(),
      NOW.getTime() + 4 * DAY,
      NOW.getTime() + 11 * DAY,
    ]);
    const tasks = await admin.query(
      `SELECT kind, "ownerId" FROM "Task" WHERE "entityId" = $1 AND "completedAt" IS NULL`,
      [e.id],
    );
    expect(tasks.rows).toEqual([{ kind: 'outreach_due', ownerId: rec.userId }]);
  });

  it('refuses do-not-contact candidates and non-owners', async () => {
    const e = await newEntry({ dnc: true });
    await expect(
      run((tx) => setSequence(tx, rec, e.id, { channel: 'email' }, NOW)),
    ).rejects.toMatchObject({ status: 409, code: 'do_not_contact' });
    const f = await newEntry();
    await expect(
      run((tx) => setSequence(tx, other, f.id, { channel: 'email' }, NOW)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('needs a confirmed profile before drafting', async () => {
    const e = await newEntry();
    await run((tx) => setSequence(tx, rec, e.id, { channel: 'email' }, NOW));
    const include = {
      keyAppeal: true,
      company: true,
      growth: true,
      impact: true,
      compensation: true,
      location: true,
      nextStep: true,
    };
    await expect(run((tx) => planOutreachDraft(tx, rec, e.id, 1, include))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('sends only an approved email: fills the names, queues it, moves the candidate and sets the next due date', async () => {
    const e = await newEntry();
    await run((tx) => setSequence(tx, rec, e.id, { channel: 'email' }, NOW));
    await expect(
      run((tx) => sendTouchEmail(tx, rec, e.id, 1, randomUUID(), NOW)),
    ).rejects.toMatchObject({ code: 'not_approved' });
    const versionId = await approvedMessage(e.id, 1);
    const sent = await run((tx) =>
      sendTouchEmail(tx, rec, e.id, 1, versionId, NOW, {
        unsubscribeFor: (address) => `https://app.test/unsub/${address}`,
      }),
    );
    const outbox = await admin.query(
      `SELECT "toAddress", "bodyText", kind, status FROM "OutboxMessage" WHERE id = $1`,
      [sent.outboxMessageId],
    );
    expect(outbox.rows[0]).toMatchObject({ kind: 'outreach', status: 'queued' });
    expect(outbox.rows[0].bodyText).toContain('Hi Jane,');
    expect(outbox.rows[0].bodyText).not.toContain('{{');
    expect(outbox.rows[0].bodyText).toContain('https://app.test/unsub/jane-');
    const view = await run((tx) => getOutreach(tx, rec, e.id, NOW));
    expect(view.touches[0]).toMatchObject({ status: 'sent' });
    expect(view.touches[1]!.dueAt?.getTime()).toBe(NOW.getTime() + 4 * DAY);
    const entry = await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [e.id]);
    expect(entry.rows[0].state).toBe('contacting');
    await expect(
      run((tx) => sendTouchEmail(tx, rec, e.id, 1, versionId, NOW)),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a suppressed address and a missing email address', async () => {
    const e = await newEntry({ email: 'stop@example.com' });
    await run((tx) => setSequence(tx, rec, e.id, { channel: 'email' }, NOW));
    const versionId = await approvedMessage(e.id, 1);
    await admin.query(
      `INSERT INTO "Suppression" (id, "agencyId", address, reason, "updatedAt") VALUES (gen_random_uuid(), $1, 'stop@example.com', 'opted_out', now())`,
      [agency],
    );
    await expect(
      run((tx) => sendTouchEmail(tx, rec, e.id, 1, versionId, NOW)),
    ).rejects.toMatchObject({ code: 'suppressed' });
    const g = await newEntry({ email: null });
    await run((tx) => setSequence(tx, rec, g.id, { channel: 'email' }, NOW));
    const v2 = await approvedMessage(g.id, 1);
    await expect(run((tx) => sendTouchEmail(tx, rec, g.id, 1, v2, NOW))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('marks hand-sent channels and refuses email there', async () => {
    const e = await newEntry();
    await run((tx) => setSequence(tx, rec, e.id, { channel: 'linkedin' }, NOW));
    const versionId = await approvedMessage(e.id, 1, 'linkedin');
    const view = await run((tx) => markTouchSentByHand(tx, rec, e.id, 1, versionId, NOW));
    expect(view.touches[0]).toMatchObject({ status: 'sent' });
    const f = await newEntry();
    await run((tx) => setSequence(tx, rec, f.id, { channel: 'email' }, NOW));
    const v = await approvedMessage(f.id, 1);
    await expect(run((tx) => markTouchSentByHand(tx, rec, f.id, 1, v, NOW))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('warns when the candidate was contacted recently, even for another position', async () => {
    const e = await newEntry();
    await run((tx) => setSequence(tx, rec, e.id, { channel: 'linkedin' }, NOW));
    await run((tx) => markTouchSentByHand(tx, rec, e.id, 1, randomUUID(), NOW)).catch(
      () => undefined,
    );
    const versionId = await approvedMessage(e.id, 1, 'linkedin');
    await run((tx) => markTouchSentByHand(tx, rec, e.id, 1, versionId, NOW));
    const position2 = await run((tx) =>
      createPosition(tx, rec, { clientId, title: 'Another', location: 'Busan' }),
    );
    const second = await run((tx) =>
      addCandidateToPosition(tx, rec, position2.id, { candidateId: e.candidateId }),
    );
    const view = await run((tx) => getOutreach(tx, rec, second.id, new Date(NOW.getTime() + DAY)));
    expect(view.recentlyContacted).toMatchObject({ byOtherPosition: true });
  });

  it('a reply cancels the remaining touches, closes the task and moves the candidate', async () => {
    const e = await newEntry();
    await run((tx) => setSequence(tx, rec, e.id, { channel: 'linkedin' }, NOW));
    const versionId = await approvedMessage(e.id, 1, 'linkedin');
    await run((tx) => markTouchSentByHand(tx, rec, e.id, 1, versionId, NOW));
    const view = await run((tx) => recordResponse(tx, rec, e.id, { response: 'interested' }, NOW));
    expect(view.touches.map((t) => t.status)).toEqual(['sent', 'cancelled', 'cancelled']);
    expect(view.touches[0]!.response).toBe('interested');
    const open = await admin.query(
      `SELECT count(*)::int AS n FROM "Task" WHERE "entityId" = $1 AND "completedAt" IS NULL`,
      [e.id],
    );
    expect(open.rows[0].n).toBe(0);
    const entry = await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [e.id]);
    expect(entry.rows[0].state).toBe('interested');
  });

  it('"not interested" needs a reason from the agency list; no answer to the last touch moves to no response', async () => {
    const e = await newEntry();
    await run((tx) => setSequence(tx, rec, e.id, { channel: 'linkedin' }, NOW));
    const v = await approvedMessage(e.id, 1, 'linkedin');
    await run((tx) => markTouchSentByHand(tx, rec, e.id, 1, v, NOW));
    await expect(
      run((tx) => recordResponse(tx, rec, e.id, { response: 'not_interested' }, NOW)),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      run((tx) =>
        recordResponse(
          tx,
          rec,
          e.id,
          { response: 'not_interested', reasonCode: DEFAULT_REJECTION_REASONS[0] },
          NOW,
        ),
      ),
    ).resolves.toBeTruthy();
    const f = await newEntry();
    await run((tx) => setSequence(tx, rec, f.id, { channel: 'linkedin' }, NOW));
    for (const n of [1, 2, 3]) {
      const vid = await approvedMessage(f.id, n, 'linkedin');
      await run((tx) =>
        markTouchSentByHand(tx, rec, f.id, n, vid, new Date(NOW.getTime() + n * DAY)),
      );
    }
    await run((tx) => recordResponse(tx, rec, f.id, { response: 'no_response' }, NOW));
    const entry = await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [f.id]);
    expect(entry.rows[0].state).toBe('no_response');
  });
});
