// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { startManualProfile } from '@/server/candidates/service';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dataRightsHandle,
  dbAvailable,
} from '@/test/db';
import { seedAgency, type SeededAgency } from '@/test/isolation-fixtures';
import { createScope } from '@/lib/db';
import { decideSuggestion, getBenchmark, planBenchmark } from '@/server/benchmark/service';
import { findInPool, getPoolMatches } from '@/server/pool/similar';
import { getPortfolio, planPortfolioCheck } from '@/server/pool/portfolio';
import { fakeEmbedder } from '@/test/pool-fixtures';
import {
  createInterview,
  listInterviews,
  recordFeedback,
  updateInterview,
} from '@/server/interviews/service';
import { getOffer, recordOutcome, saveOffer } from '@/server/offers/service';
import {
  getOutreach,
  markTouchSentByHand,
  planOutreachDraft,
  recordResponse,
  sendTouchEmail,
  setSequence,
} from '@/server/outreach/service';
import { anonymizeCandidate } from '@/server/privacy/anonymize';
import { collectCandidateData } from '@/server/privacy/export';
import { createPrivacyRequest, listPrivacyRequests } from '@/server/privacy/service';
import {
  planCallQuestions,
  planQualification,
  getQualification,
} from '@/server/qualification/service';
import {
  getApprovals,
  listConsents,
  recordConsent,
  recordResumeApproval,
} from '@/server/resume/approval';
import { getTailoredResume, planTailoredResume } from '@/server/resume/tailor';
import { classifyEntry, getScreening, saveScreening } from '@/server/screening/service';
import { getReport, planReportDraft } from '@/server/submission/report';
import { getSubmissionOverview, recordSubmission } from '@/server/submission/submit';

/**
 * Isolation for the features built on the pipeline (T-QA-01, TR-001, US-1301): acting as an admin of
 * agency A, every service that takes a pipeline entry or candidate id answers "not found" when the id
 * belongs to agency B, and nothing of B changes. The role is admin on purpose, so a refusal can only
 * come from isolation and never from permissions.
 */
describe.skipIf(!dbAvailable())('tenant isolation: pipeline features', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let drHandle: DbHandle;
  let a: SeededAgency;
  let b: SeededAgency;
  let actorA: AgencyActor;
  const agencies: string[] = [];
  const users: string[] = [];
  const asA = <T>(
    fn: (tx: Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0]) => Promise<T>,
  ) => appScope(handle).withAgency(a.agencyId, fn, { userId: actorA.userId });
  const guid = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(3);
    drHandle = dataRightsHandle();
    const [agencyA, agencyB] = [
      await createAgency(admin, 'IsoF A'),
      await createAgency(admin, 'IsoF B'),
    ];
    const [userA, userB] = [await createUser(admin), await createUser(admin)];
    agencies.push(agencyA, agencyB);
    users.push(userA, userB);
    a = await seedAgency(appScope(handle), agencyA, userA, 'alpha');
    b = await seedAgency(appScope(handle), agencyB, userB, 'bravo');
    actorA = { kind: 'agency', userId: userA, agencyId: agencyA, role: 'admin' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies, users });
    await admin.end();
    await handle.close();
    await drHandle.close();
  });

  const entry = () => b.entryId;
  const candidate = () => b.candidateId;
  const never = { versionId: guid } as const;

  const cases: [string, () => Promise<unknown>][] = [
    [
      'candidate: start a profile by hand',
      () => asA((tx) => startManualProfile(tx, actorA, candidate())),
    ],
    ['screening: read', () => asA((tx) => getScreening(tx, actorA, entry()))],
    [
      'screening: save',
      () =>
        asA((tx) =>
          saveScreening(tx, actorA, entry(), { items: { location: { rating: 'strong' } } }),
        ),
    ],
    [
      'screening: classify',
      () => asA((tx) => classifyEntry(tx, actorA, entry(), { screeningClass: 'priority' })),
    ],
    ['outreach: read', () => asA((tx) => getOutreach(tx, actorA, entry()))],
    [
      'outreach: plan the sequence',
      () => asA((tx) => setSequence(tx, actorA, entry(), { channel: 'email' })),
    ],
    [
      'outreach: draft',
      () =>
        asA((tx) =>
          planOutreachDraft(tx, actorA, entry(), 1, {
            keyAppeal: true,
            company: true,
            growth: true,
            impact: true,
            compensation: true,
            location: true,
            nextStep: true,
          }),
        ),
    ],
    ['outreach: send', () => asA((tx) => sendTouchEmail(tx, actorA, entry(), 1, never.versionId))],
    [
      'outreach: mark sent',
      () => asA((tx) => markTouchSentByHand(tx, actorA, entry(), 1, never.versionId)),
    ],
    [
      'outreach: response',
      () => asA((tx) => recordResponse(tx, actorA, entry(), { response: 'interested' })),
    ],
    ['qualification: overview', () => asA((tx) => getQualification(tx, actorA, entry()))],
    ['qualification: call questions', () => asA((tx) => planCallQuestions(tx, actorA, entry()))],
    [
      'qualification: notes',
      () => asA((tx) => planQualification(tx, actorA, entry(), 'wants 180k and 30 days')),
    ],
    ['resume: overview', () => asA((tx) => getTailoredResume(tx, actorA, entry()))],
    ['resume: tailor', () => asA((tx) => planTailoredResume(tx, actorA, entry(), false))],
    ['resume: approvals', () => asA((tx) => getApprovals(tx, actorA, entry()))],
    [
      'resume: record approval',
      () =>
        asA((tx) =>
          recordResumeApproval(tx, actorA, entry(), {
            decision: 'approved',
            approverName: 'Mallory',
            method: 'email',
            decidedAt: new Date('2026-09-01'),
          }),
        ),
    ],
    ['report: overview', () => asA((tx) => getReport(tx, actorA, entry()))],
    ['report: draft', () => asA((tx) => planReportDraft(tx, actorA, entry()))],
    ['submission: overview', () => asA((tx) => getSubmissionOverview(tx, actorA, entry()))],
    [
      'submission: record',
      () =>
        asA((tx) =>
          recordSubmission(tx, actorA, entry(), {
            reportVersionId: guid,
            tailoredResumeId: guid,
            toContactId: guid,
            method: 'email',
            submittedAt: new Date('2026-09-01'),
          }),
        ),
    ],
    ['interviews: list', () => asA((tx) => listInterviews(tx, actorA, entry()))],
    [
      'interviews: add',
      () =>
        asA((tx) =>
          createInterview(tx, actorA, entry(), { roundName: 'planted', interviewers: [] }),
        ),
    ],
    [
      'interviews: change',
      () => asA((tx) => updateInterview(tx, actorA, entry(), guid, { status: 'completed' })),
    ],
    [
      'interviews: feedback',
      () =>
        asA((tx) =>
          recordFeedback(tx, actorA, entry(), guid, {
            fromRole: 'hm',
            ratings: { technicalFit: 'gap' },
          }),
        ),
    ],
    ['offer: read', () => asA((tx) => getOffer(tx, actorA, entry()))],
    [
      'offer: save',
      () => asA((tx) => saveOffer(tx, actorA, entry(), { counterofferRisk: 'high' })),
    ],
    [
      'offer: outcome',
      () =>
        asA((tx) => recordOutcome(tx, actorA, entry(), { outcome: 'accepted', at: '2026-09-01' })),
    ],
    [
      'consent: record',
      () =>
        asA((tx) =>
          recordConsent(tx, actorA, candidate(), {
            clientId: b.clientId,
            action: 'given',
            at: new Date('2026-09-01'),
            method: 'email',
          }),
        ),
    ],
    [
      'privacy: request',
      () =>
        asA((tx) => createPrivacyRequest(tx, actorA, { candidateId: candidate(), kind: 'export' })),
    ],
    ['privacy: export data', () => asA((tx) => collectCandidateData(tx, candidate()))],
    [
      'privacy: anonymize (data-rights role)',
      () =>
        createScope(() => drHandle).withAgency(a.agencyId, (tx) =>
          anonymizeCandidate(tx, candidate()),
        ),
    ],
    [
      'pool: read matches of a position',
      () => asA((tx) => getPoolMatches(tx, actorA, b.positionId)),
    ],
    [
      'pool: find in my pool',
      () =>
        findInPool(
          { embedder: fakeEmbedder(), scope: appScope(handle), run: (async () => ({})) as never },
          actorA,
          b.positionId,
        ),
    ],
    ['portfolio: read', () => asA((tx) => getPortfolio(tx, actorA, candidate()))],
    [
      'portfolio: check open positions',
      () => asA((tx) => planPortfolioCheck(tx, actorA, candidate())),
    ],
    ['benchmark: read', () => asA((tx) => getBenchmark(tx, actorA, b.positionId))],
    ['benchmark: plan', () => asA((tx) => planBenchmark(tx, actorA, b.positionId))],
    [
      'benchmark: decide a suggestion',
      () =>
        asA((tx) =>
          decideSuggestion(tx, actorA, {
            positionId: b.positionId,
            versionId: guid,
            suggestionId: 'G1',
            decision: 'accepted',
          }),
        ),
    ],
  ];

  it.each(cases)("%s: another agency's id is not found", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ status: 404 });
  });

  it('lists show nothing of the other agency, and the other agency is unchanged', async () => {
    expect(await asA((tx) => listConsents(tx, candidate()))).toEqual({ items: [] });
    expect(await asA((tx) => listPrivacyRequests(tx, actorA))).toEqual([]);
    const rounds = await admin.query(
      `SELECT count(*)::int AS n FROM "Interview" WHERE "entryId" = $1`,
      [b.entryId],
    );
    expect(rounds.rows[0].n).toBe(0);
    const row = await admin.query(
      `SELECT "fullName", "anonymizedAt" FROM "Candidate" WHERE id = $1`,
      [b.candidateId],
    );
    expect(row.rows[0]).toEqual({ fullName: 'bravo candidate', anonymizedAt: null });
    const touched = await admin.query(
      `SELECT (SELECT count(*) FROM "OutreachTouch" WHERE "agencyId" = $1) + (SELECT count(*) FROM "Offer" WHERE "agencyId" = $1) + (SELECT count(*) FROM "Submission" WHERE "agencyId" = $1) + (SELECT count(*) FROM "Consent" WHERE "agencyId" = $1) + (SELECT count(*) FROM "PrivacyRequest" WHERE "agencyId" = $1) AS n`,
      [b.agencyId],
    );
    expect(Number(touched.rows[0].n)).toBe(0);
    const intelligence = await admin.query(
      `SELECT (SELECT count(*) FROM "ProfileEmbedding" WHERE "agencyId" = $1) + (SELECT count(*) FROM "BenchmarkDecision" WHERE "agencyId" = $1) + (SELECT count(*) FROM "LlmCall" WHERE "agencyId" = $1 AND "purpose" LIKE 'embedding.%') AS n`,
      [b.agencyId],
    );
    expect(Number(intelligence.rows[0].n)).toBe(0);
  });
});
