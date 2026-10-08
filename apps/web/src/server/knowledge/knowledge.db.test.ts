// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  patternSummaryContentSchema,
  type AgencyActor,
  type PipelineState,
  type FeedbackRatingValue,
} from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import type { ModelClient, ModelRequest } from '@/server/ai/anthropic';
import { createGateway } from '@/server/ai/gateway';
import { patternSummarizePrompt } from '@/server/ai/prompts/pattern-summarize';
import { createPromptRegistry } from '@/server/ai/prompts';
import { approveVersion, readApproved } from '@/server/artifacts/service';
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
import { getClientHistory } from './history';
import { getPatterns } from './patterns';
import { getPatternSummaryArtifact, planPatternSummary, runPatternSummary } from './summary';

/**
 * The reuse features on a seeded history (brief 14): counts come from the records, small samples
 * are flagged, what the recruiter cannot see is not counted, and no protected characteristic
 * reaches a report, a model or a draft.
 */
describe.skipIf(!dbAvailable())('client history, patterns and the A18 summary (brief 14)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let lead: AgencyActor;
  let recruiter: AgencyActor;
  let clientId: string;
  let otherClientId: string;
  let p1: string;
  let p2: string;
  let p3: string;
  const entries: Record<string, string> = {};
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);

  /** A candidate in a position who went through the given states in order. */
  async function seed(
    name: string,
    positionId: string,
    ownerId: string,
    path: PipelineState[],
    opts: {
      seniority?: string;
      years?: number;
      skills?: string[];
      source?: 'linkedin' | 'referral';
      reasonCode?: string;
      ratings?: Partial<Record<'technicalFit' | 'communication', FeedbackRatingValue>>;
      response?: string;
    } = {},
  ) {
    return run(async (tx) => {
      const candidate = await tx.candidate.create({
        data: {
          agencyId: agency,
          fullName: name,
          source: opts.source ?? 'linkedin',
          createdById: ownerId,
          status: 'active',
          seniority: opts.seniority ?? 'Director',
          yearsExperience: opts.years ?? 9,
          skills: opts.skills ?? ['Payroll'],
          // Things a report must never use:
          email: `${name.replace(/\W/g, '').toLowerCase()}@cand.test`,
          location: 'Seoul',
        },
      });
      const entry = await tx.pipelineEntry.create({
        data: {
          agencyId: agency,
          positionId,
          candidateId: candidate.id,
          ownerId,
          state: path.at(-1)!,
        },
      });
      let from: PipelineState = 'sourced';
      let n = 0;
      for (const to of path) {
        await tx.pipelineTransition.create({
          data: {
            agencyId: agency,
            entryId: entry.id,
            fromState: from,
            toState: to,
            actorId: ownerId,
            createdAt: new Date(Date.UTC(2026, 8, 1, 0, n++)),
            ...(to === path.at(-1) && opts.reasonCode ? { reasonCode: opts.reasonCode } : {}),
          },
        });
        from = to;
      }
      if (path.includes('submitted')) {
        await tx.submission.create({
          data: {
            agencyId: agency,
            entryId: entry.id,
            reportId: entry.id,
            reportVersionId: entry.id,
            reportPdfFileId: entry.id,
            tailoredResumeId: entry.id,
            resumeVersionId: entry.id,
            resumeFileId: entry.id,
            toContactId: entry.id,
            method: 'email',
            submittedAt: new Date(Date.UTC(2026, 8, 2)),
            submittedById: ownerId,
          },
        });
      }
      if (path.includes('contacting')) {
        await tx.outreachTouch.create({
          data: {
            agencyId: agency,
            entryId: entry.id,
            touchNumber: 1,
            channel: 'email',
            status: 'sent',
            response: opts.response ?? 'interested',
          },
        });
      }
      if (opts.ratings) {
        const interview = await tx.interview.create({
          data: { agencyId: agency, entryId: entry.id, roundName: 'First', status: 'completed' },
        });
        await tx.interviewFeedback.create({
          data: {
            agencyId: agency,
            interviewId: interview.id,
            fromRole: 'hm',
            source: 'portal',
            comments: 'A secret comment that must never leave the database',
            ...opts.ratings,
          },
        });
      }
      entries[name] = entry.id;
      return entry.id;
    });
  }

  const SENT: PipelineState[] = [
    'screened',
    'contacting',
    'interested',
    'qualified',
    'resume_ready',
    'candidate_approved',
    'submitted',
  ];

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(3);
    agency = await createAgency(admin, 'Knowledge A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const [u, role] of [
      [u1, 'lead'],
      [u2, 'recruiter'],
    ] as const) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
        [agency, u, role],
      );
    }
    lead = { kind: 'agency', userId: u1, agencyId: agency, role: 'lead' };
    recruiter = { kind: 'agency', userId: u2, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, lead, { name: 'Acme' }))).client.id;
    otherClientId = (await run((tx) => createClient(tx, lead, { name: 'Other Co' }))).client.id;
    p1 = (
      await run((tx) =>
        createPosition(tx, lead, { clientId, title: 'Head of HR', location: 'Seoul' }),
      )
    ).id;
    p2 = (
      await run((tx) =>
        createPosition(tx, recruiter, { clientId, title: 'Payroll lead', location: 'Seoul' }),
      )
    ).id;
    p3 = (
      await run((tx) =>
        createPosition(tx, lead, {
          clientId: otherClientId,
          title: 'Other role',
          location: 'Busan',
        }),
      )
    ).id;

    // Acme, position 1 (the lead's): six Directors submitted, four interviewed (one hired), two turned down.
    await seed('Dana', p1, u1, [...SENT, 'interviewing', 'offer', 'accepted', 'started'], {
      ratings: { technicalFit: 'strong', communication: 'strong' },
      source: 'referral',
    });
    await seed('Eli', p1, u1, [...SENT, 'interviewing'], { ratings: { technicalFit: 'strong' } });
    await seed('Fay', p1, u1, [...SENT, 'interviewing', 'rejected'], {
      ratings: { technicalFit: 'gap' },
      reasonCode: 'Skills gap',
    });
    await seed('Gus', p1, u1, [...SENT, 'interviewing']);
    await seed('Hal', p1, u1, [...SENT, 'client_rejected'], { reasonCode: 'Too old for the team' });
    await seed('Ivy', p1, u1, [...SENT, 'client_rejected'], { reasonCode: 'Compensation' });
    // Acme, position 2 (the recruiter's): two Managers, one interviewed.
    await seed('Jon', p2, u2, [...SENT, 'interviewing'], {
      seniority: 'Manager',
      years: 4,
      skills: ['Young professionals network', 'Payroll'],
    });
    await seed('Kim', p2, u2, SENT, { seniority: 'Manager', years: 4 });
    // Someone who left before submission, and who never answered.
    await seed('Lee', p2, u2, ['screened', 'contacting', 'no_response'], {
      response: 'no_response',
    });
    // Another client: must never appear in Acme's history.
    await seed('Max', p3, u1, [...SENT, 'interviewing', 'offer', 'accepted']);
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  describe('client history (T-12-01)', () => {
    it('lists what was put forward to this client, with outcomes, and counts from the records', async () => {
      const h = await run((tx) => getClientHistory(tx, lead, p1));
      expect(h.client.name).toBe('Acme');
      expect(h.totals).toEqual({ positions: 2, submitted: 8, interviewed: 5, hired: 1 });
      expect(h.candidates.map((c) => c.candidateName).sort()).toEqual([
        'Dana',
        'Eli',
        'Fay',
        'Gus',
        'Hal',
        'Ivy',
        'Jon',
        'Kim',
      ]);
      expect(h.candidates.find((c) => c.candidateName === 'Dana')).toMatchObject({
        outcome: 'hired',
        positionTitle: 'Head of HR',
        entryId: entries.Dana,
      });
      expect(h.candidates.find((c) => c.candidateName === 'Ivy')).toMatchObject({
        outcome: 'declined_after_submission',
        reasonCode: 'Compensation',
      });
      expect(h.positions.find((p) => p.id === p1)).toMatchObject({
        submitted: 6,
        interviewed: 4,
        hired: 1,
        isCurrent: true,
      });
      expect(h.candidates.some((c) => c.candidateName === 'Max')).toBe(false);
    });

    it('aggregates the hiring managers ratings by criterion with the number of ratings', async () => {
      const h = await run((tx) => getClientHistory(tx, lead, p1));
      expect(h.feedback.find((f) => f.criterion === 'technicalFit')).toMatchObject({
        strong: 2,
        gap: 1,
        total: 3,
        small: true,
      });
    });

    it('withholds a reason code that names a protected characteristic, and never returns a comment', async () => {
      const h = await run((tx) => getClientHistory(tx, lead, p1));
      expect(JSON.stringify(h)).not.toMatch(/too old/i);
      expect(h.withheldReasons).toBe(1);
      expect(JSON.stringify(h)).not.toContain('secret comment');
    });

    it('shows only the positions the viewer can see when the agency limits visibility', async () => {
      await admin.query(
        `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{visibility}', '"own_and_shared"') WHERE id = $1`,
        [agency],
      );
      try {
        const h = await run((tx) => getClientHistory(tx, recruiter, p2));
        expect(h.totals.positions).toBe(1);
        expect(h.candidates.map((c) => c.candidateName).sort()).toEqual(['Jon', 'Kim']);
        await expect(run((tx) => getClientHistory(tx, recruiter, p1))).rejects.toMatchObject({
          status: 404,
        });
      } finally {
        await admin.query(`UPDATE "Agency" SET settings = settings - 'visibility' WHERE id = $1`, [
          agency,
        ]);
      }
    });
  });

  describe('pattern reports (T-12-03, T-12-05)', () => {
    it('answers the questions with record counts, and flags small samples', async () => {
      const { reports } = await run((tx) => getPatterns(tx, lead, p1, 'client'));
      expect(reports.entries).toBe(9);
      // Q1: of 8 submitted, 5 reached an interview; Directors 4 of 6.
      expect(reports.interviewProfiles.base).toMatchObject({
        n: 8,
        hits: 5,
        rate: 63,
        small: false,
      });
      const directors = reports.interviewProfiles.seniority.find((r) => r.label === 'Director')!;
      expect(directors).toMatchObject({ n: 6, hits: 4, rate: 67, small: false });
      const managers = reports.interviewProfiles.seniority.find((r) => r.label === 'Manager')!;
      expect(managers).toMatchObject({ n: 2, hits: 1, small: true });
      expect(directors.refs.map((r) => r.entryId)).toContain(entries.Dana);
      // Q2: one hire out of eight submitted.
      expect(reports.hireProfiles.base).toMatchObject({ n: 8, hits: 1 });
      // Q3: sources
      expect(reports.sources.find((s) => s.source === 'referral')).toMatchObject({
        submitted: 1,
        hired: 1,
        small: true,
      });
      // Q4: Lee was contacted and did not answer
      const lee = reports.jdResponse.byPosition.find((r) => r.label === 'Payroll lead')!;
      expect(lee).toMatchObject({ n: 3, hits: 2 });
      // Q5: where candidates left
      expect(reports.dropOff.rows.find((r) => r.stage === 'contacting')).toMatchObject({
        count: 1,
      });
      expect(reports.dropOff.rows.find((r) => r.stage === 'submitted')).toMatchObject({ count: 2 });
      // Q6, Q7
      expect(reports.hmPreferences.decided.base).toMatchObject({ n: 7, hits: 5 });
      expect(reports.hireCharacteristics.hires).toBe(1);
    });

    it('can look across every client the viewer can see', async () => {
      const { reports, client } = await run((tx) => getPatterns(tx, lead, p1, 'agency'));
      expect(client).toBeNull();
      expect(reports.entries).toBe(10);
      expect(reports.hireProfiles.base.hits).toBe(2);
    });

    it('never puts a protected characteristic, a name or a comment into a report', async () => {
      const view = await run((tx) => getPatterns(tx, lead, p1, 'client'));
      const text = JSON.stringify(view);
      expect(text).not.toMatch(/too old|young professionals/i);
      expect(view.reports.withheld.values).toBeGreaterThanOrEqual(2);
      for (const secret of ['Dana', 'Hal', '@cand.test', 'Seoul', 'secret comment']) {
        expect(text).not.toContain(secret);
      }
    });

    it('counts only the reviewed match analyses in question 7', async () => {
      const { reports } = await run((tx) => getPatterns(tx, lead, p1, 'client'));
      expect(reports.hireCharacteristics.criteria.every((c) => c.hires.n === 0)).toBe(true);
    });
  });

  describe('the A18 summary (T-12-04)', () => {
    const calls: ModelRequest<unknown>[] = [];
    let answer: unknown;
    const model: ModelClient = {
      async complete<T>(request: ModelRequest<T>) {
        calls.push(request as ModelRequest<unknown>);
        return {
          parsed: request.schema.parse(answer),
          usage: { inputTokens: 1000, outputTokens: 400, cachedTokens: 0 },
          stopReason: 'end_turn',
          latencyMs: 5,
        };
      },
    };
    const gateway = () => {
      const prompts = createPromptRegistry();
      prompts.register(patternSummarizePrompt);
      return createGateway({ scope: appScope(handle), model, prompts });
    };
    const generate = async (actor: AgencyActor, positionId: string) => {
      const plan = await run((tx) => planPatternSummary(tx, actor, positionId));
      const result = await runPatternSummary(gateway().run, actor, positionId, plan, {
        signal: new AbortController().signal,
      });
      return { plan, result };
    };
    const factFor = (plan: Awaited<ReturnType<typeof planPatternSummary>>, part: string) =>
      plan.input.facts.find((f) => f.label.includes(part))!;

    it('sends the model counts only: no names, contacts, comments or protected words', async () => {
      calls.length = 0;
      const plan = await run((tx) => planPatternSummary(tx, lead, p1));
      const directors = factFor(plan, 'seniority "Director", who were invited');
      answer = {
        statements: [
          {
            text: `${directors.hits} of ${directors.n} Directors were invited.`,
            factIds: [directors.id],
          },
        ],
      };
      await generate(lead, p1);
      const sent = `${calls[0]!.system}\n${calls[0]!.user}`;
      for (const secret of ['Dana', 'Hal', '@cand.test', 'Seoul', 'secret comment', 'Acme']) {
        expect(sent).not.toContain(secret);
      }
      expect(sent).not.toMatch(/too old|young professionals/i);
      expect(sent).toContain(`${directors.id} [interviewProfiles]`);
    });

    it('stores a draft whose sentences each carry the records behind them', async () => {
      const plan = await run((tx) => planPatternSummary(tx, lead, p1));
      const directors = factFor(plan, 'seniority "Director", who were invited');
      const managers = factFor(plan, 'seniority "Manager", who were invited');
      answer = {
        statements: [
          {
            text: `${directors.hits} of ${directors.n} Directors were invited to interview.`,
            factIds: [directors.id],
          },
          {
            text: `Only ${managers.n} Managers were put forward, so this is tentative.`,
            factIds: [managers.id],
          },
          { text: '9 of 10 Directors were invited.', factIds: [directors.id] },
          { text: 'Younger candidates did better.', factIds: [directors.id] },
        ],
      };
      const { result } = await generate(lead, p1);
      const view = await run(async (tx) => {
        const art = await getPatternSummaryArtifact(tx, lead, p1);
        return tx.artifactVersion
          .findUniqueOrThrow({ where: { id: result.draft!.versionId } })
          .then((v) => ({ art, v }));
      });
      const content = patternSummaryContentSchema.parse(view.v.content);
      expect(view.v.status).toBe('draft');
      expect(view.v.origin).toBe('ai');
      expect(content.statements).toHaveLength(2);
      expect(content.checks.removed).toBe(2);
      expect(content.statements[0]!.tentative).toBe(false);
      expect(content.statements[1]!.tentative).toBe(true);
      expect(content.statements[0]!.evidence[0]!.refs.map((r) => r.entryId)).toContain(
        entries.Dana,
      );
      expect(content.statements[0]!.evidence[0]).toMatchObject({
        n: directors.n,
        hits: directors.hits,
      });
      expect(JSON.stringify(content)).not.toMatch(/younger|9 of 10/i);
      // A draft until the recruiter approves it (ADR-006): nothing official yet.
      expect(
        await run((tx) =>
          readApproved(tx, { kind: 'pattern_summary', subject: { type: 'position', id: p1 } }),
        ),
      ).toBeNull();
      await run((tx) => approveVersion(tx, lead, view.v.id));
      expect(
        await run((tx) =>
          readApproved(tx, { kind: 'pattern_summary', subject: { type: 'position', id: p1 } }),
        ),
      ).not.toBeNull();
    });

    it('fails and saves no draft when no sentence passes the check', async () => {
      answer = { statements: [{ text: 'Men were hired more often (3 of 4).', factIds: ['F1'] }] };
      const before = await run((tx) => tx.artifactVersion.count());
      await expect(generate(lead, p2)).rejects.toMatchObject({ status: 502 });
      expect(await run((tx) => tx.artifactVersion.count())).toBe(before);
      const failed = await admin.query(
        `SELECT status FROM "AiGeneration" WHERE "agencyId" = $1 AND purpose = 'pattern.summarize' ORDER BY "createdAt" DESC LIMIT 1`,
        [agency],
      );
      expect(failed.rows[0].status).toBe('failed');
    });

    it('needs someone who may edit the position, and records to summarize', async () => {
      await expect(run((tx) => planPatternSummary(tx, recruiter, p1))).rejects.toMatchObject({
        status: 403,
      });
      const fresh = (await run((tx) => createClient(tx, lead, { name: 'Brand new' }))).client.id;
      const position = (
        await run((tx) =>
          createPosition(tx, lead, { clientId: fresh, title: 'New', location: 'Seoul' }),
        )
      ).id;
      await expect(run((tx) => planPatternSummary(tx, lead, position))).rejects.toMatchObject({
        status: 409,
      });
    });
  });
});
