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
import { approveJdForSourcing, approveStructuredJd } from '@/test/jd-fixtures';
import { saveIntake } from './intake';
import { createPosition } from './service';
import { planSuccessProfile, runSuccessProfile } from './success-profile';

const profile = {
  summary: 's',
  criteria: [{ id: 'c1', text: 'Go', category: 'must_have', basis: 'jd' }],
  expectations: { sixMonths: '', twelveMonths: '' },
  keyChallenges: [],
};

describe.skipIf(!dbAvailable())('success profile (T-1-10)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let owner: AgencyActor;
  let other: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  const newPosition = async () =>
    (await run((tx) => createPosition(tx, owner, { clientId, title: 'Role', location: 'Seoul' })))
      .id;
  const answer = (positionId: string) =>
    run((tx) =>
      saveIntake(tx, owner, positionId, {
        answers: {
          exclusions: { value: 'No competitors' },
          must_have_experience: { value: 'Payments' },
        },
      }),
    );
  const setGuardMode = (mode: 'block' | 'warn') =>
    admin.query(
      `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{guardModes}', $2::jsonb) WHERE id = $1`,
      [
        agencyId,
        JSON.stringify({
          jdApproval: mode,
          resumeApproval: 'block',
          consent: 'block',
          recruiterAssessment: 'block',
        }),
      ],
    );

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Profile A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyId, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, owner, { name: 'Profile Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('needs an approved structured JD, then the hiring manager approval, then some intake answers', async () => {
    const id = await newPosition();
    await expect(run((tx) => planSuccessProfile(tx, owner, id))).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
    });
    await approveStructuredJd(run, owner, id);
    await expect(run((tx) => planSuccessProfile(tx, owner, id))).rejects.toMatchObject({
      code: 'guard_failed',
      guards: [{ guard: 'jdApproval', mode: 'block' }],
    });
    await approveJdForSourcing(run, owner, id);
    await expect(run((tx) => planSuccessProfile(tx, owner, id))).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
    }); // no intake yet
    await answer(id);
    const plan = await run((tx) => planSuccessProfile(tx, owner, id));
    expect(plan.inputRefs.intakeTopics).toEqual(['must_have_experience', 'exclusions']);
    expect(plan.input.intake.exclusions?.value).toBe('No competitors');
    expect(plan.overridden).toEqual([]);
  });

  it('ignores intake answers that are only proposed (from the hiring manager portal)', async () => {
    const id = await newPosition();
    await approveJdForSourcing(run, owner, id);
    await run((tx) =>
      tx.intakeRecord.upsert({
        where: { positionId: id },
        create: {
          agencyId,
          positionId: id,
          answers: {
            business_reason: { value: 'HM said so', source: 'hm_portal', status: 'proposed' },
          },
        },
        update: {
          answers: {
            business_reason: { value: 'HM said so', source: 'hm_portal', status: 'proposed' },
          },
        },
      }),
    );
    await expect(run((tx) => planSuccessProfile(tx, owner, id))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('in warn mode goes ahead with an override and records it', async () => {
    await setGuardMode('warn');
    try {
      const id = await newPosition();
      await approveStructuredJd(run, owner, id);
      await answer(id);
      await expect(run((tx) => planSuccessProfile(tx, owner, id))).rejects.toMatchObject({
        code: 'guard_failed',
        guards: [{ mode: 'warn' }],
      });
      const plan = await run((tx) =>
        planSuccessProfile(tx, owner, id, [
          { guard: 'jdApproval', reason: 'HM approved on a call' },
        ]),
      );
      expect(plan.overridden).toEqual([{ guard: 'jdApproval', reason: 'HM approved on a call' }]);
      const gateway = vi.fn(async () => ({
        generationId: 'g',
        output: {},
        draft: null,
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        costUsd: 0,
      }));
      await runSuccessProfile(gateway, owner, id, plan, {
        onDelta: vi.fn(),
        signal: new AbortController().signal,
      });
      expect(gateway).toHaveBeenCalledWith(
        'success_profile.create',
        plan.input,
        expect.objectContaining({
          inputRefs: expect.objectContaining({ overriddenGuards: plan.overridden }),
        }),
      );
    } finally {
      await admin.query(`UPDATE "Agency" SET settings = settings - 'guardModes' WHERE id = $1`, [
        agencyId,
      ]);
    }
  });

  it('is for the owner, a lead or an admin only', async () => {
    const id = await newPosition();
    await expect(run((tx) => planSuccessProfile(tx, other, id))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('confirming a version makes it the position reference for matching', async () => {
    const id = await newPosition();
    expect(
      (await run((tx) => tx.position.findUniqueOrThrow({ where: { id } })))
        .successProfileArtifactId,
    ).toBeNull();
    const artifact = await run((tx) =>
      createArtifact(tx, { agencyId, kind: 'success_profile', subject: { type: 'position', id } }),
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
    expect(
      (await run((tx) => tx.position.findUniqueOrThrow({ where: { id } })))
        .successProfileArtifactId,
    ).toBeNull(); // a draft is not confirmed
    await run((tx) => approveVersion(tx, owner, draft.id));
    expect(
      (await run((tx) => tx.position.findUniqueOrThrow({ where: { id } })))
        .successProfileArtifactId,
    ).toBe(artifact.id);
  });
});
