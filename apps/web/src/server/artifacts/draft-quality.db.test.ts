// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import type { DbHandle } from '@/lib/db/client';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import { EDIT_RATE_ALERT, getDraftQuality } from './draft-quality';
import {
  addDraftVersion,
  approveVersion,
  createArtifact,
  discardVersion,
  editDraft,
} from './service';

describe.skipIf(!dbAvailable())('draft quality metric (T-AI-14)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let otherAgencyId: string;
  let actor: AgencyActor;
  const userId = randomUUID();
  const scope = () => appScope(handle);
  const run = <T>(fn: (tx: ScopedTx) => Promise<T>) => scope().withAgency(agencyId, fn);

  async function aiDraft(purpose: string, content: Record<string, unknown>, forAgency = agencyId) {
    return scope().withAgency(forAgency, async (tx) => {
      const generation = await tx.aiGeneration.create({
        data: {
          agencyId: forAgency,
          purpose,
          requestedById: userId,
          promptVersion: 'v1',
          model: 'claude-sonnet-5-5',
          inputRefs: {},
          status: 'succeeded',
        },
      });
      const artifact = await createArtifact(tx, {
        agencyId: forAgency,
        kind: 'structured_jd',
        subject: { type: 'position', id: randomUUID() },
      });
      const version = await addDraftVersion(tx, {
        agencyId: forAgency,
        artifactId: artifact.id,
        content,
        origin: 'ai',
        createdById: userId,
        aiGenerationId: generation.id,
      });
      return { artifactId: artifact.id, versionId: version.id };
    });
  }
  const approve = (versionId: string) => run((tx) => approveVersion(tx, actor, versionId));

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(3);
    agencyId = await createAgency(admin, 'Quality');
    otherAgencyId = await createAgency(admin, 'Quality Other');
    actor = { kind: 'agency', userId, agencyId, role: 'recruiter' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId, otherAgencyId] });
    await admin.end();
    await handle.close();
  });

  it('measures unchanged, edited and discarded AI drafts per purpose, and overall', async () => {
    const since = new Date(Date.now() - 60_000);
    const unchanged = await aiDraft('jd.structure', { text: 'one two three four' });
    await approve(unchanged.versionId);

    const slightly = await aiDraft('jd.structure', { text: 'one two three four' });
    const edit = await run((tx) =>
      editDraft(tx, actor, slightly.versionId, { text: 'one two three five' }),
    );
    await approve(edit.id); // 1 of 4 words changed

    const dropped = await aiDraft('jd.structure', { text: 'garbage' });
    await run((tx) => discardVersion(tx, actor, dropped.versionId));

    // Two rounds of edits: measured against the AI original, not the previous edit.
    const chain = await aiDraft('success_profile.create', { text: 'a b c d' });
    const e1 = await run((tx) => editDraft(tx, actor, chain.versionId, { text: 'a b c x' }));
    const e2 = await run((tx) => editDraft(tx, actor, e1.id, { text: 'a b y x' }));
    await approve(e2.id); // 2 of 4 words differ from the original

    const rows = await run((tx) => getDraftQuality(tx, { since }));
    const byPurpose = Object.fromEntries(rows.map((r) => [r.purpose, r]));

    expect(byPurpose['jd.structure']).toMatchObject({
      approved: 2,
      unchanged: 1,
      edited: 1,
      editRate: 0.5,
      discarded: 1,
    });
    expect(byPurpose['jd.structure']!.meanEditRatio).toBe(0.125);
    expect(byPurpose['success_profile.create']).toMatchObject({
      approved: 1,
      unchanged: 0,
      edited: 1,
      editRate: 1,
      meanEditRatio: 0.5,
      medianEditRatio: 0.5,
      discarded: 0,
    });
    expect(byPurpose['all']).toMatchObject({ approved: 3, unchanged: 1, edited: 2, discarded: 1 });
    expect(byPurpose['all']!.editRate).toBeCloseTo(0.6667, 3);
    expect(byPurpose['all']!.editRate).toBeGreaterThan(EDIT_RATE_ALERT);
  });

  it('ignores versions a person wrote from the start', async () => {
    const since = new Date();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await run(async (tx) => {
      const artifact = await createArtifact(tx, {
        agencyId,
        kind: 'structured_jd',
        subject: { type: 'position', id: randomUUID() },
      });
      const v = await addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content: { text: 'mine' },
        origin: 'human',
        createdById: userId,
      });
      await approveVersion(tx, actor, v.id);
    });
    const rows = await run((tx) => getDraftQuality(tx, { since }));
    expect(rows.find((r) => r.purpose === 'all')!.approved).toBe(0);
  });

  it('counts only the requested period', async () => {
    const future = new Date(Date.now() + 3_600_000);
    const rows = await run((tx) =>
      getDraftQuality(tx, { since: future, until: new Date(future.getTime() + 1000) }),
    );
    expect(rows).toEqual([
      {
        purpose: 'all',
        approved: 0,
        unchanged: 0,
        edited: 0,
        editRate: 0,
        meanEditRatio: 0,
        medianEditRatio: 0,
        discarded: 0,
      },
    ]);
  });

  it("does not count another agency's drafts", async () => {
    const since = new Date(Date.now() - 60_000);
    const theirs = await aiDraft('jd.structure', { text: 'their draft' }, otherAgencyId);
    await scope().withAgency(otherAgencyId, (tx) =>
      approveVersion(
        tx,
        { kind: 'agency', userId, agencyId: otherAgencyId, role: 'recruiter' },
        theirs.versionId,
      ),
    );
    const mine = await run((tx) => getDraftQuality(tx, { since }));
    const theirRows = await scope().withAgency(otherAgencyId, (tx) =>
      getDraftQuality(tx, { since }),
    );
    expect(theirRows.find((r) => r.purpose === 'all')!.approved).toBe(1);
    expect(mine.find((r) => r.purpose === 'all')!.approved).toBeLessThanOrEqual(3);
    expect(mine.some((r) => r.purpose === 'jd.structure' && r.approved === 3)).toBe(false);
  });
});
