// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { submissionReportContentSchema, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  findOrCreateArtifact,
  setFactCheck,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { addCandidateToPosition } from '@/server/pipeline/service';
import { createPosition } from '@/server/positions/service';
import { renderDocument, type RenderDeps } from '@/server/documents/render/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { readyMatchEntry } from '@/test/match-fixtures';
import { recordConsent, recordResumeApproval } from '@/server/resume/approval';
import { getSubmissionOverview, recordSubmission } from './submit';

const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...new Uint8Array(200).fill(65)]);

describe.skipIf(!dbAvailable())('record submission (T-8-04)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let clientId: string;
  let contactId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const renderDeps = (): RenderDeps => ({
    withAgency: run,
    renderer: vi.fn(async () => PDF),
    store: null,
    baseUrl: 'http://app.test/',
    secret: 'test-secret',
  });
  const input = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    method: 'email',
    submittedAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  });

  const approve = async (
    entryId: string,
    kind: 'tailored_resume' | 'submission_report',
    content: unknown,
  ) => {
    const artifact = await run((tx) =>
      findOrCreateArtifact(tx, {
        agencyId: agency,
        kind,
        subject: { type: 'pipeline_entry', id: entryId },
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
    await run((tx) => setFactCheck(tx, v.id, { ranAt: new Date().toISOString(), warnings: [] }));
    await run((tx) => approveVersion(tx, rec, v.id));
    return v.id;
  };
  /** An entry ready to submit: report and resume approved with PDFs, candidate approval and consent recorded. */
  const prepare = async (
    entry: { id: string },
    candidateId: string,
    opts: { pdfs?: boolean; approval?: boolean; consent?: boolean },
  ) => {
    await run((tx) =>
      tx.pipelineEntry.update({ where: { id: entry.id }, data: { state: 'candidate_approved' } }),
    );
    const reportVersionId = await approve(
      entry.id,
      'submission_report',
      submissionReportContentSchema.parse({ overview: 'Fine.', recruiterAssessment: 'Strong.' }),
    );
    const resumeVersionId = await approve(entry.id, 'tailored_resume', { summary: 'HR leader.' });
    if (opts.pdfs !== false) {
      for (const [kind, versionId] of [
        ['report', reportVersionId],
        ['resume', resumeVersionId],
      ] as const) {
        await renderDocument(renderDeps(), {
          agencyId: agency,
          requestedById: rec.userId,
          kind,
          versionId,
        });
      }
    }
    if (opts.approval !== false) {
      await run((tx) =>
        recordResumeApproval(tx, rec, entry.id, {
          decision: 'approved',
          approverName: 'Alex Kim',
          method: 'email',
          decidedAt: new Date('2026-09-30T00:00:00Z'),
        }),
      );
    }
    if (opts.consent !== false) {
      await run((tx) =>
        recordConsent(tx, rec, candidateId, {
          clientId,
          action: 'given',
          at: new Date('2026-09-30T00:00:00Z'),
          method: 'email',
        }),
      );
    }
    const overview = await run((tx) => getSubmissionOverview(tx, rec, entry.id));
    return {
      entry,
      candidateId,
      overview,
      reportVersionId,
      resumeVersionId,
      body: input({
        reportVersionId,
        tailoredResumeId: overview.resume?.tailoredResumeId,
        toContactId: contactId,
      }),
    };
  };
  const readyEntry = async (
    opts: { pdfs?: boolean; approval?: boolean; consent?: boolean } = {},
  ) => {
    const { entry, candidateId } = await readyMatchEntry(run, rec, clientId);
    return prepare(entry, candidateId, opts);
  };
  /** The same candidate in another position of the same client. */
  const secondEntry = async (candidateId: string) => {
    const position = await run((tx) =>
      createPosition(tx, rec, { clientId, title: 'Another role', location: 'Busan' }),
    );
    const entry = await run((tx) => addCandidateToPosition(tx, rec, position.id, { candidateId }));
    return prepare(entry, candidateId, {});
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Submit A');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Sub Client' }))).client.id;
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

  it('records the submission, moves the candidate and pins the exact versions and files', async () => {
    const r = await readyEntry();
    expect(r.overview.report?.pdfFileId).toBeTruthy();
    expect(r.overview.resume?.pdfFileId).toBeTruthy();
    const view = await run((tx) => recordSubmission(tx, rec, r.entry.id, r.body as never));
    expect(view).toMatchObject({
      toContactName: 'Ms. Park',
      method: 'email',
      reportVersionId: r.reportVersionId,
      resumeVersionId: r.resumeVersionId,
    });
    expect(view.reportPdfFileId).toBe(r.overview.report!.pdfFileId);
    expect(view.resumeFileId).toBe(r.overview.resume!.pdfFileId);
    const entry = await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [
      r.entry.id,
    ]);
    expect(entry.rows[0].state).toBe('submitted');
    const overview = await run((tx) => getSubmissionOverview(tx, rec, r.entry.id));
    expect(overview.submissions).toHaveLength(1);
  });

  it('refuses while the candidate approval or consent is missing, and records nothing', async () => {
    const r = await readyEntry({ approval: false, consent: false });
    await expect(
      run((tx) => recordSubmission(tx, rec, r.entry.id, r.body as never)),
    ).rejects.toMatchObject({
      code: 'guard_failed',
    });
    const rows = await admin.query(
      `SELECT count(*)::int AS n FROM "Submission" WHERE "entryId" = $1`,
      [r.entry.id],
    );
    expect(rows.rows[0].n).toBe(0);
    const entry = await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [
      r.entry.id,
    ]);
    expect(entry.rows[0].state).toBe('candidate_approved');
  });

  it('needs current PDFs of both documents', async () => {
    const r = await readyEntry({ pdfs: false });
    await expect(
      run((tx) => recordSubmission(tx, rec, r.entry.id, r.body as never)),
    ).rejects.toMatchObject({
      code: 'pdf_missing',
    });
  });

  it('refuses ids that are no longer the approved ones, and a contact of another client', async () => {
    const r = await readyEntry();
    await expect(
      run((tx) =>
        recordSubmission(tx, rec, r.entry.id, {
          ...r.body,
          reportVersionId: crypto.randomUUID(),
        } as never),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      run((tx) =>
        recordSubmission(tx, rec, r.entry.id, {
          ...r.body,
          tailoredResumeId: crypto.randomUUID(),
        } as never),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      run((tx) =>
        recordSubmission(tx, rec, r.entry.id, {
          ...r.body,
          toContactId: crypto.randomUUID(),
        } as never),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('asks for a reason before submitting the same candidate to the same client again', async () => {
    const first = await readyEntry();
    await run((tx) => recordSubmission(tx, rec, first.entry.id, first.body as never));
    const second = await secondEntry(first.candidateId);
    expect(second.overview.earlierToClient).toHaveLength(1);
    await expect(
      run((tx) => recordSubmission(tx, rec, second.entry.id, second.body as never)),
    ).rejects.toMatchObject({ code: 'duplicate_submission', status: 409 });
    const view = await run((tx) =>
      recordSubmission(tx, rec, second.entry.id, {
        ...second.body,
        duplicateReason: 'Client asked again for the new role',
      } as never),
    );
    expect(view.method).toBe('email');
  });
});
