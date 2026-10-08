// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { candidateTagsInputSchema, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { readyMatchEntry } from '@/test/match-fixtures';
import { addNote, deleteNote, listNotes, setTags, updateNote } from './notes';
import { searchCandidates } from './search';

describe.skipIf(!dbAvailable())('tags and notes on a candidate (T-2-13, FR-SRC-09)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let other: string;
  let alice: AgencyActor;
  let bob: AgencyActor;
  let boss: AgencyActor;
  let outsider: AgencyActor;
  let candidateId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const actor = async (ag: string, role: 'recruiter' | 'admin'): Promise<AgencyActor> => {
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
      [ag, u, role],
    );
    return { kind: 'agency', userId: u, agencyId: ag, role };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Notes A');
    other = await createAgency(admin, 'Notes B');
    alice = await actor(agency, 'recruiter');
    bob = await actor(agency, 'recruiter');
    boss = await actor(agency, 'admin');
    outsider = await actor(other, 'admin');
    const clientId = (await run((tx) => createClient(tx, alice, { name: 'Notes Client' }))).client
      .id;
    candidateId = (await readyMatchEntry(run, alice, clientId)).candidateId;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency, other] });
    await admin.end();
    await handle.close();
  });

  it('cleans tags: trimmed, lowercase, no repeats, no commas', () => {
    expect(
      candidateTagsInputSchema.parse({
        tags: ['  Silicon Valley ', 'silicon  valley', 'Returner'],
      }),
    ).toEqual({ tags: ['silicon valley', 'returner'] });
    expect(candidateTagsInputSchema.safeParse({ tags: ['a,b'] }).success).toBe(false);
    expect(
      candidateTagsInputSchema.safeParse({
        tags: Array(21)
          .fill('x')
          .map((t, i) => t + i),
      }).success,
    ).toBe(false);
  });

  it('sets the tags, logs what changed, and the pool filter finds them', async () => {
    await run((tx) => setTags(tx, alice, candidateId, { tags: ['vip', 'returner'] }));
    await run((tx) => setTags(tx, bob, candidateId, { tags: ['vip', 'seoul'] }));
    const find = (tag: string) =>
      run((tx) => searchCandidates(tx, { tags: [tag] } as never, { limit: 25 }));
    expect((await find('seoul')).items.map((c) => c.id)).toContain(candidateId);
    expect((await find('returner')).items).toHaveLength(0);
    const log = await admin.query(
      `SELECT data FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'candidate.tags_changed' ORDER BY "createdAt"`,
      [candidateId],
    );
    expect(log.rows.map((r) => r.data)).toEqual([
      { added: ['vip', 'returner'], removed: [] },
      { added: ['seoul'], removed: ['returner'] },
    ]);
  });

  it('keeps notes with their author; only the author edits; the author or an admin deletes', async () => {
    const note = await run((tx) => addNote(tx, alice, candidateId, { body: 'Prefers calls' }));
    expect(note).toMatchObject({ canEdit: true, canDelete: true });
    const seenByBob = (await run((tx) => listNotes(tx, bob, candidateId)))[0]!;
    expect(seenByBob).toMatchObject({ body: 'Prefers calls', canEdit: false, canDelete: false });
    await expect(
      run((tx) => updateNote(tx, bob, candidateId, note.id, { body: 'x' })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(run((tx) => deleteNote(tx, bob, candidateId, note.id))).rejects.toMatchObject({
      status: 403,
    });
    await run((tx) =>
      updateNote(tx, alice, candidateId, note.id, { body: 'Prefers calls after 6' }),
    );
    expect((await run((tx) => listNotes(tx, boss, candidateId)))[0]!).toMatchObject({
      body: 'Prefers calls after 6',
      canDelete: true,
      canEdit: false,
    });
    await run((tx) => deleteNote(tx, boss, candidateId, note.id));
    expect(await run((tx) => listNotes(tx, alice, candidateId))).toHaveLength(0);
  });

  it('puts "a note was added" on the timeline without the text', async () => {
    await run((tx) => addNote(tx, alice, candidateId, { body: 'Secret salary expectation' }));
    const log = await admin.query(
      `SELECT data FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'candidate.note_added'`,
      [candidateId],
    );
    expect(log.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(log.rows)).not.toContain('Secret');
  });

  it("another agency's candidate is not found", async () => {
    const asOther = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(other, fn);
    await expect(asOther((tx) => listNotes(tx, outsider, candidateId))).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      asOther((tx) => addNote(tx, outsider, candidateId, { body: 'planted' })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      asOther((tx) => setTags(tx, outsider, candidateId, { tags: ['planted'] })),
    ).rejects.toMatchObject({ status: 404 });
  });
});
