// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, approveVersion, createArtifact } from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
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
import { confirmAddAndPlan } from './confirm-and-add';
import { createCandidateDraft } from './intake';

/** Random letters, so two fixture people never look alike to the duplicate check (name + employer). */
const letters = (n: number) =>
  [...randomUUID().replaceAll('-', '')]
    .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
    .join('')
    .slice(0, n);

/** A new person each call; pass the same object to a second draft to make a real duplicate. */
const profile = (over: Record<string, unknown> = {}) => {
  const company = `${letters(10)} Corp`;
  return {
    fullName: `${letters(8)} ${letters(8)}`,
    email: `${letters(10)}@x.com`,
    phone: null,
    currentPosition: { title: 'HR Director', company },
    careerHistory: [
      {
        company,
        title: 'HR Director',
        start: '2019',
        end: null,
        current: true,
        summary: 'Managed a team of 20',
      },
    ],
    education: [],
    coreSkills: ['payroll'],
    industryExperience: [],
    technicalSkills: [],
    leadershipExperience: null,
    teamSize: '20',
    careerProgression: null,
    location: 'Seoul',
    workAuthorization: null,
    compensationExpectation: null,
    majorAchievements: [],
    potentialMotivation: null,
    potentialConcerns: [],
    ...over,
  };
};
const successProfile = {
  summary: 'A senior HR leader',
  criteria: [{ id: 'c1', text: '8 years in HR', category: 'must_have', basis: 'jd' }],
  expectations: { sixMonths: '', twelveMonths: '' },
  keyChallenges: [],
};

describe.skipIf(!dbAvailable())('confirm, add to position and plan the analysis', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let actor: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);

  const newPosition = async (opts: { successProfile?: boolean } = {}) => {
    const id = (
      await run((tx) =>
        createPosition(tx, actor, { clientId, title: 'Head of HR', location: 'Seoul' }),
      )
    ).id;
    if (opts.successProfile) {
      const artifact = await run((tx) =>
        createArtifact(tx, {
          agencyId,
          kind: 'success_profile',
          subject: { type: 'position', id },
        }),
      );
      const v = await run((tx) =>
        addDraftVersion(tx, {
          agencyId,
          artifactId: artifact.id,
          content: successProfile,
          origin: 'human',
          createdById: actor.userId,
        }),
      );
      await run((tx) => approveVersion(tx, actor, v.id));
    }
    return id;
  };
  /** A pasted LinkedIn profile as the AI step leaves it: a draft candidate with a profile draft. */
  const pasted = async (content: Record<string, unknown> = profile()) => {
    const draft = await run((tx) =>
      createCandidateDraft(
        tx,
        actor,
        { source: 'linkedin' },
        {
          filename: 'profile.txt',
          bytes: new TextEncoder().encode(`profile ${randomUUID()}`),
          kind: 'profile_text',
        },
      ),
    );
    const artifact = await run((tx) =>
      createArtifact(tx, {
        agencyId,
        kind: 'candidate_profile',
        subject: { type: 'candidate', id: draft.candidateId },
      }),
    );
    await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content,
        origin: 'ai',
        createdById: actor.userId,
      }),
    );
    return draft.candidateId;
  };
  const go = (positionId: string, draftId: string, rest: Record<string, unknown> = {}) =>
    run((tx) => confirmAddAndPlan(tx, actor, positionId, { draftId, ...rest }));
  const rows = async (sql: string, args: unknown[]) => (await admin.query(sql, args)).rows;

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Paste A');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
      [agencyId, u],
    );
    actor = { kind: 'agency', userId: u, agencyId, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, actor, { name: 'Paste Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('confirms, adds to the position as sourced and offers the analysis when both profiles are approved', async () => {
    const positionId = await newPosition({ successProfile: true });
    const draftId = await pasted();
    const result = await go(positionId, draftId);
    expect(result.candidateId).toBe(draftId);
    expect(result.entry).toMatchObject({ positionId, candidateId: draftId, state: 'sourced' });
    expect(result.alreadyInPosition).toBe(false);
    expect(result.analysis).toEqual({ ready: true, reason: null });
    const [c] = await rows(`SELECT status FROM "Candidate" WHERE id = $1`, [draftId]);
    expect(c.status).toBe('active');
    // Nothing was analyzed: the recruiter's click starts the streamed analysis afterwards.
    expect(await rows(`SELECT 1 FROM "Artifact" WHERE kind = 'match_analysis'`, [])).toEqual([]);
  });

  it('confirms and adds but says why the analysis cannot start without a success profile', async () => {
    const positionId = await newPosition();
    const result = await go(positionId, await pasted());
    expect(result.entry.state).toBe('sourced');
    expect(result.analysis.ready).toBe(false);
    expect(result.analysis.reason).toMatch(/success profile/i);
  });

  it('asks for a duplicate resolution and changes nothing until it is given', async () => {
    const positionId = await newPosition({ successProfile: true });
    const shared = profile();
    await go(positionId, await pasted(shared));
    const second = await pasted(shared);
    const other = await newPosition({ successProfile: true });
    await expect(go(other, second)).rejects.toMatchObject({ code: 'possible_duplicate' });
    const [c] = await rows(`SELECT status FROM "Candidate" WHERE id = $1`, [second]);
    expect(c.status).toBe('draft');
    expect(await rows(`SELECT 1 FROM "PipelineEntry" WHERE "positionId" = $1`, [other])).toEqual(
      [],
    );
  });

  it('does not offer an analysis on stale facts after a merge into an existing candidate', async () => {
    const positionId = await newPosition({ successProfile: true });
    const shared = profile();
    const original = await pasted(shared);
    await go(positionId, original);
    const again = await pasted(shared);
    const result = await go(positionId, again, { resolution: 'merge', targetId: original });
    expect(result.mergedIntoId).toBe(original);
    expect(result.candidateId).toBe(original);
    expect(result.alreadyInPosition).toBe(true);
    expect(result.analysis.ready).toBe(false);
  });

  it('leaves the candidate a draft when the position is closed', async () => {
    const positionId = await newPosition({ successProfile: true });
    await admin.query(`UPDATE "Position" SET status = 'cancelled' WHERE id = $1`, [positionId]);
    const draftId = await pasted();
    await expect(go(positionId, draftId)).rejects.toMatchObject({ status: 409 });
    const [c] = await rows(`SELECT status FROM "Candidate" WHERE id = $1`, [draftId]);
    expect(c.status).toBe('draft');
  });

  it("treats a position that is not this agency's as not found", async () => {
    const draftId = await pasted();
    await expect(go(randomUUID(), draftId)).rejects.toMatchObject({ status: 404 });
    const [c] = await rows(`SELECT status FROM "Candidate" WHERE id = $1`, [draftId]);
    expect(c.status).toBe('draft');
  });
});
