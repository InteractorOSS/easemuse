// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  qualificationContentSchema,
  submissionReportContentSchema,
  type AgencyActor,
} from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { reportDraftPrompt } from '@/server/ai/prompts/report-draft';
import { resumeTailorPrompt } from '@/server/ai/prompts/resume-tailor';
import {
  addDraftVersion,
  approveVersion,
  editDraft,
  findOrCreateArtifact,
} from '@/server/artifacts/service';
import { renderDocument, type RenderDeps } from '@/server/documents/render/service';
import { createClient } from '@/server/clients/service';
import { createInterview, recordFeedback, updateInterview } from '@/server/interviews/service';
import { analyzeEntry } from '@/server/matching/analyze';
import { markReviewed } from '@/server/matching/detail';
import { getOffer, recordOutcome, saveOffer } from '@/server/offers/service';
import { markTouchSentByHand, recordResponse, setSequence } from '@/server/outreach/service';
import { transitionEntry } from '@/server/pipeline/service';
import { recordConsent, recordResumeApproval } from '@/server/resume/approval';
import { generateTailoredResume } from '@/server/resume/tailor';
import { classifyEntry } from '@/server/screening/service';
import { generateReport } from '@/server/submission/report';
import { getSubmissionOverview, recordSubmission } from '@/server/submission/submit';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { approveJdForSourcing } from '@/test/jd-fixtures';
import { fakeMatchRunner, readyMatchEntry } from '@/test/match-fixtures';

const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...new Uint8Array(200).fill(65)]);

/**
 * The release 1 loop from sourcing to start date (T-QA-06, Release 1 exit): one candidate goes through
 * every stage with real services and a real database. The AI model and the PDF printer are
 * stand-ins, because no model key or browser is needed to check that the pieces fit together: each
 * step must accept what the previous one produced, and every guard must pass for a good reason.
 */
describe.skipIf(!dbAvailable())('release 1 happy path (T-QA-06)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let clientId: string;
  let contactId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const NOW = new Date();
  const stateOf = async (entryId: string) =>
    (await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [entryId])).rows[0]
      .state as string;
  const move = (entryId: string, to: Parameters<typeof transitionEntry>[3]['to']) =>
    run((tx) => transitionEntry(tx, rec, entryId, { to }));
  const approveContent = async (
    entryId: string,
    kind: 'outreach_message' | 'qualification',
    content: unknown,
    touch?: number,
  ) => {
    const artifact = await run((tx) =>
      findOrCreateArtifact(tx, {
        agencyId: agency,
        kind,
        subject: { type: 'pipeline_entry', id: entryId },
      }),
    );
    if (touch)
      await run((tx) =>
        tx.outreachTouch.updateMany({
          where: { entryId, touchNumber: touch },
          data: { artifactId: artifact.id },
        }),
      );
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: artifact.id,
        content,
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await run((tx) => approveVersion(tx, rec, v.id));
    return v.id;
  };
  const gateway = {
    run: async () => ({ generationId: randomUUID(), output: { unsupported: [] }, draft: null }),
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(3);
    agency = await createAgency(admin, 'Happy path');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Happy Client' }))).client.id;
    contactId = (
      await run((tx) =>
        tx.clientContact.create({
          data: { agencyId: agency, clientId, name: 'Ms. Park' },
          select: { id: true },
        }),
      )
    ).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('takes a candidate from sourced to started, and fills the position', async () => {
    const { entry, positionId } = await readyMatchEntry(run, rec, clientId);
    const e = entry.id;
    await approveJdForSourcing(run, rec, positionId);
    expect(await stateOf(e)).toBe('sourced');

    // Matching: analyze, then the recruiter reviews it
    const analysis = await analyzeEntry(
      { run: fakeMatchRunner(run, agency, rec.userId), withAgency: run },
      rec,
      e,
    );
    await run((tx) => markReviewed(tx, rec, analysis.id));

    // Screening, then outreach
    await run((tx) => classifyEntry(tx, rec, e, { screeningClass: 'priority' }));
    expect(await stateOf(e)).toBe('screened');
    await run((tx) => setSequence(tx, rec, e, { channel: 'linkedin' }, NOW));
    const messageId = await approveContent(
      e,
      'outreach_message',
      {
        channel: 'linkedin',
        touchNumber: 1,
        subject: '',
        body: 'Hi {{first_name}}, a role for you.',
      },
      1,
    );
    await run((tx) => markTouchSentByHand(tx, rec, e, 1, messageId, NOW));
    expect(await stateOf(e)).toBe('contacting');
    await run((tx) => recordResponse(tx, rec, e, { response: 'interested' }, NOW));
    expect(await stateOf(e)).toBe('interested');

    // Qualification
    await approveContent(
      e,
      'qualification',
      qualificationContentSchema.parse({
        fields: {
          interest: { value: 'keen', level: 'high', confirmed: true },
          compensation: { value: '180-190k', confirmed: true },
        },
      }),
    );
    await move(e, 'qualified');

    // Resume: tailored, fact-checked, approved, then the candidate's answer
    const tailorModel = async (
      _p: 'resume.tailor',
      input: Parameters<typeof resumeTailorPrompt.buildPrompt>[0],
      ctx: { artifactId?: string },
    ) => {
      const output = {
        summary: 'HR leader.',
        roles: [{ index: 1, bullets: ['Managed a team of 20'] }],
        skills: ['payroll'],
      };
      const content = resumeTailorPrompt.toContent!(resumeTailorPrompt.schema.parse(output), input);
      const draft = await run(async (tx) => {
        const v = await addDraftVersion(tx, {
          agencyId: agency,
          artifactId: ctx.artifactId!,
          content,
          origin: 'ai',
          createdById: rec.userId,
        });
        return { artifactId: ctx.artifactId!, versionId: v.id, version: v.version };
      });
      return { generationId: randomUUID(), output, draft };
    };
    const resume = await generateTailoredResume(
      { run: tailorModel as never, gateway: gateway as never, withAgency: run },
      rec,
      e,
      false,
    );
    await run((tx) => approveVersion(tx, rec, resume.draft!.versionId));
    await move(e, 'resume_ready');
    await run((tx) =>
      recordResumeApproval(tx, rec, e, {
        decision: 'approved',
        approverName: 'Alex Kim',
        method: 'email',
        decidedAt: NOW,
      }),
    );
    await run((tx) =>
      recordConsent(tx, rec, entry.candidateId, {
        clientId,
        action: 'given',
        at: NOW,
        method: 'email',
      }),
    );
    await move(e, 'candidate_approved');

    // Report: drafted from the reviewed analysis and confirmed qualification, then the assessment
    const reportModel = async (
      _p: 'report.draft',
      input: Parameters<typeof reportDraftPrompt.buildPrompt>[0],
      ctx: { artifactId?: string },
    ) => {
      const output = Object.fromEntries(
        Object.keys(submissionReportContentSchema.shape)
          .filter((k) => !['recruiterAssessment', 'missingInputs'].includes(k))
          .map((k) => [k, `text ${k}`]),
      );
      const content = reportDraftPrompt.toContent!(reportDraftPrompt.schema.parse(output), input);
      const draft = await run(async (tx) => {
        const v = await addDraftVersion(tx, {
          agencyId: agency,
          artifactId: ctx.artifactId!,
          content,
          origin: 'ai',
          createdById: rec.userId,
        });
        return { artifactId: ctx.artifactId!, versionId: v.id, version: v.version };
      });
      return { generationId: randomUUID(), output, draft };
    };
    const report = await generateReport(
      { run: reportModel as never, gateway: gateway as never, withAgency: run },
      rec,
      e,
    );
    expect(report.missingInputs).toEqual([]);
    const drafted = await run((tx) =>
      tx.artifactVersion.findUniqueOrThrow({
        where: { id: report.draft!.versionId },
        select: { content: true },
      }),
    );
    const edited = await run((tx) =>
      editDraft(tx, rec, report.draft!.versionId, {
        ...(drafted.content as object),
        recruiterAssessment: 'My pick for this role.',
      }),
    );
    await run((tx) => approveVersion(tx, rec, edited.id, { factCheckResolutions: {} }));

    // PDFs of both documents, then the submission
    const renderer = vi.fn(async () => PDF);
    const deps: RenderDeps = {
      withAgency: run,
      renderer,
      store: null,
      baseUrl: 'http://app.test/',
      secret: 'test-secret',
    };
    const overview0 = await run((tx) => getSubmissionOverview(tx, rec, e));
    await renderDocument(deps, {
      agencyId: agency,
      requestedById: rec.userId,
      kind: 'report',
      versionId: overview0.report!.versionId,
    });
    await renderDocument(deps, {
      agencyId: agency,
      requestedById: rec.userId,
      kind: 'resume',
      versionId: overview0.resume!.versionId,
    });
    const overview = await run((tx) => getSubmissionOverview(tx, rec, e));
    const submission = await run((tx) =>
      recordSubmission(tx, rec, e, {
        reportVersionId: overview.report!.versionId,
        tailoredResumeId: overview.resume!.tailoredResumeId,
        toContactId: contactId,
        method: 'email',
        submittedAt: NOW,
      }),
    );
    expect(submission.toContactName).toBe('Ms. Park');
    expect(await stateOf(e)).toBe('submitted');

    // Interviews, offer and start
    const round = await run((tx) =>
      createInterview(tx, rec, e, {
        roundName: 'HM interview',
        scheduledAt: new Date(NOW.getTime() + 86_400_000),
        interviewers: ['Ms. Park'],
      }),
    );
    expect(await stateOf(e)).toBe('interviewing');
    await run((tx) =>
      recordFeedback(tx, rec, e, round.id, {
        fromRole: 'hm',
        ratings: { technicalFit: 'strong', leadershipFit: 'strong' },
        comments: 'Hire.',
      }),
    );
    await run((tx) => updateInterview(tx, rec, e, round.id, { status: 'completed' }));
    await move(e, 'offer');
    await run((tx) =>
      saveOffer(tx, rec, e, { counterofferRisk: 'low', startDate: '2026-12-01' }, NOW),
    );
    await run((tx) =>
      recordOutcome(tx, rec, e, { outcome: 'accepted', at: NOW.toISOString().slice(0, 10) }, NOW),
    );
    expect(
      (await admin.query(`SELECT status FROM "Position" WHERE id = $1`, [positionId])).rows[0]
        .status,
    ).toBe('filled');
    const started = await run((tx) =>
      recordOutcome(tx, rec, e, { outcome: 'started', at: NOW.toISOString().slice(0, 10) }, NOW),
    );
    expect(started).toMatchObject({ state: 'started', outcome: 'started' });
    expect((await run((tx) => getOffer(tx, rec, e))).milestones.offerAcceptance.status).toBe(
      'done',
    );

    // The history shows the whole path, in order
    const history = await admin.query(
      `SELECT "toState" FROM "PipelineTransition" WHERE "entryId" = $1 ORDER BY "createdAt", id`,
      [e],
    );
    expect(history.rows.map((r) => r.toState)).toEqual([
      'sourced',
      'screened',
      'contacting',
      'interested',
      'qualified',
      'resume_ready',
      'candidate_approved',
      'submitted',
      'interviewing',
      'offer',
      'accepted',
      'started',
    ]);
  });
});
