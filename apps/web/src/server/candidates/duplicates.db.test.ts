// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, createArtifact } from '@/server/artifacts/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { duplicatesForCandidate, findDuplicates, matchKeys } from './duplicates';
import { createCandidateDraft } from './intake';

const emptyProfile = {
  fullName: null,
  email: null,
  phone: null,
  currentPosition: { title: null, company: null },
  careerHistory: [],
  education: [],
  coreSkills: [],
  industryExperience: [],
  technicalSkills: [],
  leadershipExperience: null,
  teamSize: null,
  careerProgression: null,
  location: null,
  workAuthorization: null,
  compensationExpectation: null,
  majorAchievements: [],
  potentialMotivation: null,
  potentialConcerns: [],
};

describe.skipIf(!dbAvailable())('duplicate detection (T-2-04)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let actor: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);
  let alex: string;

  const addActive = (
    data: {
      fullName: string;
      email?: string;
      phone?: string;
      profileUrl?: string;
      employers?: string[];
      status?: 'active' | 'draft' | 'discarded';
      mergedIntoId?: string;
    },
    agency = agencyA,
  ) =>
    appScope(handle)
      .withAgency(agency, (tx) =>
        tx.candidate.create({
          data: {
            agencyId: agency,
            fullName: data.fullName,
            email: data.email ?? null,
            phone: data.phone ?? null,
            profileUrl: data.profileUrl ?? null,
            source: 'linkedin',
            createdById: actor.userId,
            status: data.status ?? 'active',
            mergedIntoId: data.mergedIntoId ?? null,
            ...matchKeys({
              phone: data.phone,
              profileUrl: data.profileUrl,
              employers: data.employers,
            }),
          },
          select: { id: true },
        }),
      )
      .then((c) => c.id);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Dup A');
    agencyB = await createAgency(admin, 'Dup B');
    actor = {
      kind: 'agency',
      userId: await createUser(admin),
      agencyId: agencyA,
      role: 'recruiter',
    };
    alex = await addActive({
      fullName: 'Alex Kim',
      email: 'alex@x.com',
      phone: '+82 10-1234-5678',
      profileUrl: 'https://www.linkedin.com/in/alex-kim/',
      employers: ['Northwind Inc.', 'Contoso'],
    });
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('finds an exact match by email, whatever the case', async () => {
    const found = await run((tx) => findDuplicates(tx, { email: 'ALEX@X.COM' }));
    expect(found).toEqual([
      expect.objectContaining({ candidateId: alex, strength: 'exact', reasons: ['email'] }),
    ]);
  });

  it('finds the same phone number written differently, and the same profile link', async () => {
    expect((await run((tx) => findDuplicates(tx, { phone: '010 1234 5678' })))[0]).toMatchObject({
      candidateId: alex,
      reasons: ['phone'],
    });
    expect(
      (await run((tx) => findDuplicates(tx, { profileUrl: 'linkedin.com/in/ALEX-KIM?x=1' })))[0],
    ).toMatchObject({ candidateId: alex, reasons: ['profile_url'] });
  });

  it('lists every reason when several match', async () => {
    const [match] = await run((tx) =>
      findDuplicates(tx, {
        email: 'alex@x.com',
        phone: '+821012345678',
        profileUrl: 'https://linkedin.com/in/alex-kim',
      }),
    );
    expect(match!.reasons).toEqual(['email', 'phone', 'profile_url']);
  });

  it('flags a very similar name with a shared employer as possible, not exact', async () => {
    const [match] = await run((tx) =>
      findDuplicates(tx, { fullName: 'Kim, Alex', employers: ['NORTHWIND'] }),
    );
    expect(match).toMatchObject({
      candidateId: alex,
      strength: 'possible',
      reasons: ['name_employer'],
      nameScore: 1,
    });
  });

  it('does not flag the same name without a shared employer, or a shared employer with another name', async () => {
    expect(
      await run((tx) => findDuplicates(tx, { fullName: 'Alex Kim', employers: ['Fabrikam'] })),
    ).toEqual([]);
    expect(
      await run((tx) => findDuplicates(tx, { fullName: 'Jamie Park', employers: ['Northwind'] })),
    ).toEqual([]);
    expect(await run((tx) => findDuplicates(tx, { fullName: 'Alex Kim' }))).toEqual([]);
  });

  it('finds nothing when there is nothing to match on', async () => {
    expect(await run((tx) => findDuplicates(tx, {}))).toEqual([]);
    expect(await run((tx) => findDuplicates(tx, { phone: '123' }))).toEqual([]);
  });

  it('leaves out drafts, discarded and merged candidates, and the candidate being checked', async () => {
    await addActive({ fullName: 'Draft Dana', email: 'dana@x.com', status: 'draft' });
    await addActive({ fullName: 'Gone Gus', email: 'dana@x.com', status: 'discarded' });
    await addActive({ fullName: 'Merged Mo', email: 'dana@x.com', mergedIntoId: alex });
    expect(await run((tx) => findDuplicates(tx, { email: 'dana@x.com' }))).toEqual([]);
    expect(await run((tx) => findDuplicates(tx, { email: 'alex@x.com', excludeId: alex }))).toEqual(
      [],
    );
  });

  it('puts exact matches before possible ones, and does not look into other agencies', async () => {
    const twin = await addActive({
      fullName: 'Alex Kimm',
      email: 'other@x.com',
      employers: ['Contoso'],
    });
    const found = await run((tx) =>
      findDuplicates(tx, { email: 'alex@x.com', fullName: 'Alex Kim', employers: ['Contoso'] }),
    );
    expect(found.map((m) => [m.candidateId, m.strength])).toEqual([
      [alex, 'exact'],
      [twin, 'possible'],
    ]);
    await addActive({ fullName: 'Other Agency Person', email: 'secret@b.com' }, agencyB);
    expect(await run((tx) => findDuplicates(tx, { email: 'secret@b.com' }))).toEqual([]);
  });

  describe('for a candidate being added', () => {
    const draft = (profileUrl?: string) =>
      run((tx) =>
        createCandidateDraft(
          tx,
          actor,
          { source: 'linkedin', ...(profileUrl ? { profileUrl } : {}) },
          {
            filename: `${randomUUID()}.txt`,
            bytes: new TextEncoder().encode(`resume ${randomUUID()}`),
            kind: 'resume',
          },
        ),
      );

    it('uses the profile link given at intake before any profile exists', async () => {
      const { candidateId } = await draft('https://www.linkedin.com/in/alex-kim');
      expect((await run((tx) => duplicatesForCandidate(tx, candidateId)))[0]).toMatchObject({
        candidateId: alex,
        reasons: ['profile_url'],
      });
    });

    it('uses the name, email, phone and employers of the newest profile draft', async () => {
      const { candidateId } = await draft();
      expect(await run((tx) => duplicatesForCandidate(tx, candidateId))).toEqual([]);
      const artifact = await run((tx) =>
        createArtifact(tx, {
          agencyId: agencyA,
          kind: 'candidate_profile',
          subject: { type: 'candidate', id: candidateId },
        }),
      );
      await run((tx) =>
        addDraftVersion(tx, {
          agencyId: agencyA,
          artifactId: artifact.id,
          origin: 'ai',
          createdById: actor.userId,
          content: {
            ...emptyProfile,
            fullName: 'Alex Kim',
            email: 'alex@x.com',
            careerHistory: [
              {
                company: 'Northwind',
                title: 'HR Director',
                start: '2019',
                end: null,
                current: true,
                summary: '',
              },
            ],
          },
        }),
      );
      const found = await run((tx) => duplicatesForCandidate(tx, candidateId));
      expect(found[0]).toMatchObject({
        candidateId: alex,
        strength: 'exact',
        reasons: ['email', 'name_employer'],
      });
    });

    it('is 404 for an unknown or discarded candidate', async () => {
      await expect(run((tx) => duplicatesForCandidate(tx, randomUUID()))).rejects.toMatchObject({
        status: 404,
      });
      const gone = await addActive({ fullName: 'Gone', status: 'discarded' });
      await expect(run((tx) => duplicatesForCandidate(tx, gone))).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
