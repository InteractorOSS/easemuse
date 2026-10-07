// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JD_SECTIONS, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, approveVersion, createArtifact } from '@/server/artifacts/service';
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
import { createPosition } from './service';
import { getStructuredJdArtifact, listRequirements } from './structured-jd';

const content = (requirements: { id: string; text: string; category: string }[]) => ({
  sections: Object.fromEntries(JD_SECTIONS.map((s) => [s, { status: 'found', summary: 'x' }])),
  requirements: requirements.map((r) => ({ section: 'technical_skills', quote: '', ...r })),
});

describe.skipIf(!dbAvailable())('approving a structured JD makes its requirements (T-1-07)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let actor: AgencyActor;
  let positionId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  const approveDraft = async (artifactId: string, c: unknown) => {
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId,
        content: c,
        origin: 'ai',
        createdById: actor.userId,
      }),
    );
    await run((tx) => approveVersion(tx, actor, v.id));
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Req Sync');
    const userId = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
      [agencyId, userId],
    );
    actor = { kind: 'agency', userId, agencyId, role: 'recruiter' };
    const client = (await run((tx) => createClient(tx, actor, { name: 'Sync Client' }))).client;
    positionId = (
      await run((tx) =>
        createPosition(tx, actor, { clientId: client.id, title: 'Backend', location: 'Seoul' }),
      )
    ).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('has no artifact and no requirements before the first draft', async () => {
    expect(await run((tx) => getStructuredJdArtifact(tx, actor, positionId))).toEqual({
      artifactId: null,
      approvedVersionId: null,
    });
    expect(await run((tx) => listRequirements(tx, actor, positionId))).toEqual([]);
  });

  it('replaces the requirement rows on every approval, keeping the recruiter order and ids', async () => {
    const artifact = await run((tx) =>
      createArtifact(tx, {
        agencyId,
        kind: 'structured_jd',
        subject: { type: 'position', id: positionId },
      }),
    );
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await approveDraft(
      artifact.id,
      content([
        { id: a, text: 'Go', category: 'must_have' },
        { id: b, text: 'Remote', category: 'preferred' },
      ]),
    );
    expect(
      (await run((tx) => listRequirements(tx, actor, positionId))).map((r) => [
        r.id,
        r.text,
        r.category,
        r.sortOrder,
      ]),
    ).toEqual([
      [a, 'Go', 'must_have', 0],
      [b, 'Remote', 'preferred', 1],
    ]);
    // A second approval: order changed, one removed, one added, a category changed.
    await approveDraft(
      artifact.id,
      content([
        { id: b, text: 'Remote', category: 'nice_to_have' },
        { id: c, text: 'No agencies', category: 'disqualifying' },
      ]),
    );
    expect(
      (await run((tx) => listRequirements(tx, actor, positionId))).map((r) => [
        r.id,
        r.category,
        r.sortOrder,
      ]),
    ).toEqual([
      [b, 'nice_to_have', 0],
      [c, 'disqualifying', 1],
    ]);
    const found = await run((tx) => getStructuredJdArtifact(tx, actor, positionId));
    expect(found.artifactId).toBe(artifact.id);
    expect(found.approvedVersionId).toBeTruthy();
  });

  it('does not touch requirements while a version is still a draft', async () => {
    const artifact = await run((tx) => getStructuredJdArtifact(tx, actor, positionId));
    await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.artifactId!,
        content: content([{ id: randomUUID(), text: 'Draft only', category: 'must_have' }]),
        origin: 'ai',
        createdById: actor.userId,
      }),
    );
    expect(
      (await run((tx) => listRequirements(tx, actor, positionId))).map((r) => r.text),
    ).not.toContain('Draft only');
  });
});
