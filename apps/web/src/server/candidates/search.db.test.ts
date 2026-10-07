// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, approveVersion, createArtifact } from '@/server/artifacts/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { searchCandidates } from './search';
import { matchKeys } from './duplicates';

const profile = (over: Record<string, unknown>) => ({
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
  ...over,
});

describe.skipIf(!dbAvailable())('talent pool search (T-2-08, T-2-09)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let actor: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);
  const search = (
    query: Parameters<typeof searchCandidates>[1],
    page: { limit?: number; cursor?: string } = {},
  ) => run((tx) => searchCandidates(tx, query, { limit: page.limit ?? 25, cursor: page.cursor }));
  const names = async (query: Parameters<typeof searchCandidates>[1]) =>
    (await search(query)).items.map((c) => c.fullName);

  /** A candidate that went through the real path: draft, profile approval, hook fills the fields and the index. */
  const addApproved = async (content: Record<string, unknown>, agency = agencyA) => {
    const scope = appScope(handle);
    const id = await scope.withAgency(agency, async (tx) => {
      const c = await tx.candidate.create({
        data: {
          agencyId: agency,
          fullName: 'Draft',
          source: 'linkedin',
          createdById: actor.userId,
          status: 'draft',
          ...matchKeys({}),
        },
        select: { id: true },
      });
      const artifact = await createArtifact(tx, {
        agencyId: agency,
        kind: 'candidate_profile',
        subject: { type: 'candidate', id: c.id },
      });
      const v = await addDraftVersion(tx, {
        agencyId: agency,
        artifactId: artifact.id,
        content: profile(content),
        origin: 'human',
        createdById: actor.userId,
      });
      await approveVersion(tx, { ...actor, agencyId: agency }, v.id);
      await tx.candidate.update({ where: { id: c.id }, data: { status: 'active' } });
      return c.id;
    });
    return id;
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Pool A');
    agencyB = await createAgency(admin, 'Pool B');
    actor = {
      kind: 'agency',
      userId: await createUser(admin),
      agencyId: agencyA,
      role: 'recruiter',
    };
    await addApproved({
      fullName: 'Alex Kim',
      currentPosition: { title: 'HR Director', company: 'Northwind' },
      location: 'Seoul',
      technicalSkills: ['Payroll', 'Workday'],
      careerHistory: [
        {
          company: 'Northwind',
          title: 'HR Director',
          start: '2012',
          end: null,
          current: true,
          summary: 'Ran payroll and benefits in California',
        },
      ],
    });
    await addApproved({
      fullName: 'Jamie Park',
      currentPosition: { title: 'Senior Recruiter', company: 'Contoso' },
      location: 'Busan',
      technicalSkills: ['Sourcing', 'Workday'],
      careerHistory: [
        {
          company: 'Contoso',
          title: 'Recruiter',
          start: '2018',
          end: null,
          current: true,
          summary: 'Hired engineers',
        },
      ],
    });
    await addApproved({
      fullName: 'Dana Cho',
      currentPosition: { title: 'Payroll Manager', company: 'Fabrikam' },
      location: 'Seoul',
      coreSkills: ['payroll'],
      careerHistory: [
        {
          company: 'Fabrikam',
          title: 'Payroll Manager',
          start: '2005',
          end: null,
          current: true,
          summary: '',
        },
      ],
    });
    await addApproved({
      fullName: '김민수',
      currentPosition: { title: '인사팀 팀장', company: '삼성전자' },
      location: '서울',
      coreSkills: ['인사', '채용'],
      careerHistory: [
        {
          company: '삼성전자',
          title: '인사팀 팀장',
          start: '2010',
          end: null,
          current: true,
          summary: '',
        },
      ],
    });
    await addApproved(
      {
        fullName: 'Other Agency Person',
        currentPosition: { title: 'HR Director', company: 'Zed' },
      },
      agencyB,
    );
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('fills the denormalized fields and seniority when a profile is approved', async () => {
    const alex = (await search({ q: 'Alex' })).items[0]!;
    expect(alex).toMatchObject({
      fullName: 'Alex Kim',
      currentTitle: 'HR Director',
      location: 'Seoul',
      seniority: 'Director',
      skills: ['Workday'.replace('Workday', 'Payroll'), 'Workday'],
    });
    expect(alex.yearsExperience).toBe(new Date().getUTCFullYear() - 2012);
  });

  it('finds words anywhere in the profile, ignoring case, and matches the start of a word', async () => {
    expect(await names({ q: 'payroll' })).toEqual(expect.arrayContaining(['Alex Kim', 'Dana Cho']));
    expect(await names({ q: 'HR Dir' })).toEqual(['Alex Kim']);
    expect(await names({ q: 'california' })).toEqual(['Alex Kim']); // from a job summary
  });

  it('puts a name or title match ahead of one found only in the details', async () => {
    const ranked = await search({ q: 'payroll' });
    expect(ranked.items[0]!.fullName).toBe('Dana Cho'); // "Payroll Manager" is a title; Alex has it in skills and a summary
    expect(ranked.items.every((c) => c.rank !== null && c.rank > 0)).toBe(true);
    expect(ranked.items.map((c) => c.rank)).toEqual(
      [...ranked.items.map((c) => c.rank)].sort((a, b) => b! - a!),
    );
  });

  it('searches Korean', async () => {
    expect(await names({ q: '인사' })).toEqual(['김민수']);
    expect(await names({ q: '삼성' })).toEqual(['김민수']);
  });

  it('requires every word and every skill asked for', async () => {
    expect(await names({ q: 'payroll recruiter' })).toEqual([]);
    expect(await names({ skills: ['workday'] })).toEqual(
      expect.arrayContaining(['Alex Kim', 'Jamie Park']),
    );
    expect(await names({ skills: ['Workday', 'Payroll'] })).toEqual(['Alex Kim']);
    expect(await names({ skills: ['Workday', 'Kubernetes'] })).toEqual([]);
  });

  it('filters by seniority, location, and years', async () => {
    expect(await names({ seniority: 'director' })).toEqual(['Alex Kim']);
    expect(await names({ location: 'seoul' })).toEqual(
      expect.arrayContaining(['Alex Kim', 'Dana Cho']),
    );
    expect(await names({ location: 'busan' })).toEqual(['Jamie Park']);
    expect(await names({ minYears: 20 })).toEqual(['Dana Cho']);
    expect(await names({ minYears: 14, maxYears: 16 })).toEqual(
      expect.arrayContaining(['Alex Kim', '김민수']),
    );
    expect(await names({ minYears: 14, maxYears: 16 })).not.toContain('Dana Cho');
    expect(
      await names({ q: 'HR Director payroll', seniority: 'Director', location: 'Seoul' }),
    ).toEqual(['Alex Kim']);
  });

  it('treats search text as text, never as query syntax', async () => {
    expect(await names({ q: '\'; DROP TABLE "Candidate"; --' })).toEqual([]);
    expect(await names({ q: '&|!:*' })).toEqual(expect.arrayContaining(['Alex Kim'])); // nothing to search for: everyone, newest first
    expect(await names({ location: '%' })).toEqual([]); // a LIKE wildcard is a plain character
  });

  it('lists everyone newest first without text, and pages with no repeats or gaps', async () => {
    const all = await search({}, { limit: 100 });
    expect(all.items.map((c) => c.fullName)).toEqual([
      '김민수',
      'Dana Cho',
      'Jamie Park',
      'Alex Kim',
    ]);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const page = await search({}, { limit: 1, cursor });
      seen.push(...page.items.map((c) => c.fullName));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(['김민수', 'Dana Cho', 'Jamie Park', 'Alex Kim']);
  });

  it('pages a text search best-match first, with no repeats or gaps', async () => {
    const full = (await search({ q: 'workday payroll hr' }, { limit: 100 })).items.map((c) => c.id);
    const everyone = (await search({ q: 'payroll' }, { limit: 100 })).items.map((c) => c.id);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const page = await search({ q: 'payroll' }, { limit: 1, cursor });
      seen.push(...page.items.map((c) => c.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(everyone);
    void full;
  });

  it('leaves out drafts, discarded and merged candidates', async () => {
    const draftId = await run((tx) =>
      tx.candidate
        .create({
          data: {
            agencyId: agencyA,
            fullName: 'Hidden Draft',
            source: 'other',
            createdById: actor.userId,
            status: 'draft',
          },
          select: { id: true },
        })
        .then((c) => c.id),
    );
    await run(
      (tx) =>
        tx.$executeRaw`UPDATE "Candidate" SET "searchText" = to_tsvector('simple', 'payroll hidden') WHERE id = ${draftId}::uuid`,
    );
    expect(await names({ q: 'hidden' })).toEqual([]);
    expect(await names({})).not.toContain('Hidden Draft');
  });

  it('never returns another agency’s candidates', async () => {
    expect(await names({ q: 'Zed' })).toEqual([]);
    expect(await names({ q: 'Other Agency' })).toEqual([]);
    const other = await appScope(handle).withAgency(agencyB, (tx) =>
      searchCandidates(tx, { q: 'HR' }, { limit: 25 }),
    );
    expect(other.items.map((c) => c.fullName)).toEqual(['Other Agency Person']);
  });

  describe('at 50,000 candidates (NFR-P03: results within 2 seconds)', () => {
    let big: string;
    beforeAll(async () => {
      big = await createAgency(admin, 'Pool Big');
      await admin.query(
        `INSERT INTO "Candidate" (id, "agencyId", "fullName", source, status, "createdById", "currentTitle", location, seniority, skills, "yearsExperience", tags, "employerKeys", "searchText", "updatedAt", "createdAt")
         SELECT gen_random_uuid(), $1, 'Person ' || n, 'linkedin', 'active', $2,
           (ARRAY['HR Director','Payroll Manager','Recruiter','Software Engineer','Finance Analyst','Head of Talent','Operations Lead'])[1 + n % 7],
           (ARRAY['Seoul','Busan','California','London','Berlin','Austin'])[1 + n % 6],
           (ARRAY['Director','Manager','Senior','Junior','Lead'])[1 + n % 5],
           ARRAY[(ARRAY['payroll','workday','sql','go','excel','sourcing'])[1 + n % 6], (ARRAY['compliance','benefits','python','hiring'])[1 + n % 4]],
           n % 25, ARRAY[]::text[], ARRAY[]::text[],
           setweight(to_tsvector('simple', 'Person ' || n || ' ' || (ARRAY['HR Director','Payroll Manager','Recruiter','Software Engineer','Finance Analyst','Head of Talent','Operations Lead'])[1 + n % 7]), 'A') ||
           setweight(to_tsvector('simple', (ARRAY['payroll','workday','sql','go','excel','sourcing'])[1 + n % 6] || ' ' || (ARRAY['compliance','benefits','python','hiring'])[1 + n % 4]), 'B') ||
           setweight(to_tsvector('simple', (ARRAY['Seoul','Busan','California','London','Berlin','Austin'])[1 + n % 6]), 'C'),
           now(), now() - (n || ' seconds')::interval
         FROM generate_series(1, 50000) AS n`,
        [big, actor.userId],
      );
      await admin.query('ANALYZE "Candidate"');
    }, 120_000);

    const timed = async (query: Parameters<typeof searchCandidates>[1]) => {
      const start = performance.now();
      const result = await appScope(handle).withAgency(big, (tx) =>
        searchCandidates(tx, query, { limit: 25 }),
      );
      return { ms: performance.now() - start, result };
    };

    it('answers a typical search within 2 seconds, with filters, and pages deep', async () => {
      const cases: Parameters<typeof searchCandidates>[1][] = [
        { q: 'HR Director payroll Seoul', seniority: 'Director' },
        { q: 'payroll' },
        { q: 'recruiter sourcing' },
        { skills: ['payroll', 'compliance'], location: 'Seoul', minYears: 10 },
        { q: 'zzzznomatch' },
        {},
      ];
      for (const query of cases) {
        const { ms, result } = await timed(query);
        expect(ms, JSON.stringify(query)).toBeLessThan(2000);
        if (query.q !== 'zzzznomatch') expect(result.items.length).toBeGreaterThan(0);
      }
      const first = await timed({ q: 'payroll' });
      const deep = await appScope(handle).withAgency(big, (tx) =>
        searchCandidates(tx, { q: 'payroll' }, { limit: 25, cursor: first.result.nextCursor! }),
      );
      expect(deep.items[0]!.id).not.toBe(first.result.items[0]!.id);
    }, 60_000);

    afterAll(async () => {
      await admin.query(`DELETE FROM "Candidate" WHERE "agencyId" = $1`, [big]);
      await cleanup(admin, { agencies: [big] });
    }, 120_000);
  });
});
