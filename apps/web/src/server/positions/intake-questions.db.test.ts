// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
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
import { approveStructuredJd } from '@/test/jd-fixtures';
import {
  getIntakeQuestionsArtifact,
  planIntakeQuestions,
  runIntakeQuestions,
} from './intake-questions';
import { createPosition } from './service';

describe.skipIf(!dbAvailable())('intake questions plan (T-1-08)', () => {
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
    agencyId = await createAgency(admin, 'IQ A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyId, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId, role: 'recruiter' };
    const client = (await run((tx) => createClient(tx, owner, { name: 'IQ Client' }))).client;
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

  it('is refused (409) until a structured JD has been approved', async () => {
    await expect(run((tx) => planIntakeQuestions(tx, owner, positionId))).rejects.toMatchObject({
      status: 409,
    });
    expect(await run((tx) => getIntakeQuestionsArtifact(tx, owner, positionId))).toEqual({
      artifactId: null,
      approvedVersionId: null,
    });
  });

  it('is written from the approved structured JD, and names the version it used', async () => {
    const version = await approveStructuredJd(run, owner, positionId);
    const plan = await run((tx) => planIntakeQuestions(tx, owner, positionId));
    expect(plan.inputRefs).toEqual({ structuredJdVersionId: version, positionId });
    expect(plan.input.position).toEqual({ title: 'Backend', location: 'Seoul' });
    expect(Object.keys(plan.input.structuredJd.sections)).toHaveLength(13);
  });

  it('is for the owner, a lead or an admin only', async () => {
    await expect(run((tx) => planIntakeQuestions(tx, other, positionId))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('runs the gateway for this person and position', async () => {
    const plan = await run((tx) => planIntakeQuestions(tx, owner, positionId));
    const gateway = vi.fn(async () => ({
      generationId: 'g',
      output: {},
      draft: null,
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      costUsd: 0,
    }));
    const stream = { onDelta: vi.fn(), signal: new AbortController().signal };
    await runIntakeQuestions(gateway, owner, positionId, plan, stream);
    expect(gateway).toHaveBeenCalledWith(
      'intake.questions',
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
