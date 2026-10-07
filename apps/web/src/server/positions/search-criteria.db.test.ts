// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
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
import {
  getSearchCriteriaArtifact,
  planSearchCriteria,
  runSearchCriteria,
} from './search-criteria';

const profile = {
  summary: 'A senior Go engineer',
  criteria: [{ id: 'c1', text: 'Go', category: 'must_have', basis: 'jd' }],
  expectations: { sixMonths: '', twelveMonths: '' },
  keyChallenges: [],
};

describe.skipIf(!dbAvailable())('search criteria plan (T-2-01)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let owner: AgencyActor;
  let other: AgencyActor;
  let positionId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Search A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyId, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId, role: 'recruiter' };
    const client = (await run((tx) => createClient(tx, owner, { name: 'Search Client' }))).client;
    positionId = (
      await run((tx) =>
        createPosition(tx, owner, { clientId: client.id, title: 'Backend', location: 'Seoul' }),
      )
    ).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('is refused (409) until the success profile is confirmed, even if a draft exists', async () => {
    const artifact = await run((tx) =>
      createArtifact(tx, {
        agencyId,
        kind: 'success_profile',
        subject: { type: 'position', id: positionId },
      }),
    );
    const draft = await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content: profile,
        origin: 'ai',
        createdById: owner.userId,
      }),
    );
    await expect(run((tx) => planSearchCriteria(tx, owner, positionId))).rejects.toMatchObject({
      status: 409,
    });
    await run((tx) => approveVersion(tx, owner, draft.id));
    const plan = await run((tx) => planSearchCriteria(tx, owner, positionId));
    expect(plan.inputRefs).toEqual({ successProfileVersionId: draft.id, positionId });
    expect(plan.input.position).toEqual({ title: 'Backend', location: 'Seoul' });
  });

  it('is for the owner, a lead or an admin only', async () => {
    await expect(run((tx) => planSearchCriteria(tx, other, positionId))).rejects.toMatchObject({
      status: 403,
    });
    expect(await run((tx) => getSearchCriteriaArtifact(tx, other, positionId))).toEqual({
      artifactId: null,
      approvedVersionId: null,
    });
  });

  it('runs the gateway for this person and position', async () => {
    const plan = await run((tx) => planSearchCriteria(tx, owner, positionId));
    const gateway = vi.fn(async () => ({
      generationId: 'g',
      output: {},
      draft: null,
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      costUsd: 0,
    }));
    await runSearchCriteria(gateway, owner, positionId, plan, {
      onDelta: vi.fn(),
      signal: new AbortController().signal,
    });
    expect(gateway).toHaveBeenCalledWith(
      'search_criteria.create',
      plan.input,
      expect.objectContaining({
        agencyId,
        actor: owner,
        positionId,
        subject: { type: 'position', id: positionId },
      }),
    );
  });
});
