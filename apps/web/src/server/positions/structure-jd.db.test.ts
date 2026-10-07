// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
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
import { createClient } from '@/server/clients/service';
import { addPastedOriginal } from './jd';
import { createPosition } from './service';
import { planStructureJd, runStructureJd } from './structure-jd';

const JD = 'Senior Backend Engineer. '.repeat(10);

describe.skipIf(!dbAvailable())('structure JD plan (T-1-06)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let owner: AgencyActor;
  let other: AgencyActor;
  let positionId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Structure A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyId, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId, role: 'recruiter' };
    const client = (await inA((tx) => createClient(tx, owner, { name: 'Structure Client' })))
      .client;
    positionId = (
      await inA((tx) =>
        createPosition(tx, owner, {
          clientId: client.id,
          title: 'Backend',
          location: 'Seoul',
          requiredSkills: ['Go'],
          compMin: 100,
          compMax: 200,
        }),
      )
    ).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('refuses with 422 until a readable original exists', async () => {
    await expect(inA((tx) => planStructureJd(tx, owner, positionId))).rejects.toMatchObject({
      status: 422,
      code: 'unreadable_document',
    });
    // An upload that is still pending does not count.
    await inA((tx) =>
      tx.jobDescription.create({
        data: { agencyId, positionId, kind: 'original', extractionStatus: 'pending' },
      }),
    );
    await expect(inA((tx) => planStructureJd(tx, owner, positionId))).rejects.toMatchObject({
      status: 422,
    });
  });

  it('uses the newest readable original and the position fields the recruiter entered', async () => {
    await inA((tx) =>
      addPastedOriginal(tx, owner, positionId, 'An older version of the JD. '.repeat(5)),
    );
    const newest = await inA((tx) => addPastedOriginal(tx, owner, positionId, JD));
    const plan = await inA((tx) => planStructureJd(tx, owner, positionId));
    expect(plan.input.jdText).toBe(JD);
    expect(plan.inputRefs).toEqual({ jobDescriptionId: newest.id, positionId });
    expect(plan.input.position).toMatchObject({
      title: 'Backend',
      location: 'Seoul',
      requiredSkills: ['Go'],
      compensation: '100-200 USD',
    });
  });

  it('is for the owner, a lead or an admin only', async () => {
    await expect(inA((tx) => planStructureJd(tx, other, positionId))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('runs the gateway for this person, position and subject, passing the stream along', async () => {
    const plan = await inA((tx) => planStructureJd(tx, owner, positionId));
    const run = vi.fn(async () => ({
      generationId: 'g',
      output: {},
      draft: null,
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      costUsd: 0,
    }));
    const onDelta = vi.fn();
    const signal = new AbortController().signal;
    await runStructureJd(run, owner, positionId, plan, { onDelta, signal });
    expect(run).toHaveBeenCalledWith(
      'jd.structure',
      plan.input,
      expect.objectContaining({
        agencyId,
        actor: owner,
        positionId,
        subject: { type: 'position', id: positionId },
        inputRefs: plan.inputRefs,
        onDelta,
        signal,
      }),
    );
    void randomUUID;
  });
});
