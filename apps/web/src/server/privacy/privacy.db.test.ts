// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRIVACY_DEADLINE_DAYS, type AgencyActor } from '@easemuse/core';
import { createScope } from '@/lib/db';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  findOrCreateArtifact,
  setFactCheck,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
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
import { readyMatchEntry } from '@/test/match-fixtures';
import { recordResumeApproval } from '@/server/resume/approval';
import { anonymizeCandidate, DELETED_NAME } from './anonymize';
import { buildCandidateZip, collectCandidateData, fileSourceFor } from './export';
import { runAnonymizeJob, runExportJob } from './jobs';
import {
  beginPrivacyRequest,
  createPrivacyRequest,
  listPrivacyRequests,
  rejectPrivacyRequest,
} from './service';

const DAY = 86_400_000;
const NOW = new Date('2026-10-07T09:00:00Z');

describe.skipIf(!dbAvailable())('candidate data rights (T-0-04, T-0-05, T-0-06)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let drHandle: DbHandle;
  let agency: string;
  let other: string;
  let boss: AgencyActor;
  let lead: AgencyActor;
  let rec: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const drScope = () => createScope(() => drHandle);
  const count = async (sql: string, params: unknown[]) =>
    (await admin.query(sql, params)).rows[0].n as number;

  /** A candidate with data in every table the deletion has to reach. */
  const fixture = async () => {
    const { entry, candidateId } = await readyMatchEntry(run, rec, clientId);
    await run((tx) =>
      tx.candidate.update({
        where: { id: candidateId },
        data: {
          email: 'jane@example.com',
          phone: '010-1234',
          profileUrl: 'https://linkedin.com/in/jane',
          currentTitle: 'HR Director',
          location: 'Seoul',
          skills: ['payroll'],
          tags: ['vip'],
          phoneKey: '0101234',
          employerKeys: ['northwind'],
        },
      }),
    );
    await admin.query(
      `UPDATE "Candidate" SET "searchText" = to_tsvector('simple', 'jane doe hr') WHERE id = $1`,
      [candidateId],
    );
    // An original resume, a generated PDF, and a render of it
    const original = await admin.query(
      `INSERT INTO "FileObject" (id, "agencyId", store, filename, "contentType", "sizeBytes", sha256, "updatedAt") VALUES (gen_random_uuid(), $1, 'db', 'cv.txt', 'text/plain', 11, $2, now()) RETURNING id`,
      [agency, randomUUID()],
    );
    await admin.query(
      `INSERT INTO "FileBlob" (id, "agencyId", "fileId", bytes) VALUES (gen_random_uuid(), $1, $2, $3)`,
      [agency, original.rows[0].id, Buffer.from('Jane Doe CV')],
    );
    await admin.query(
      `INSERT INTO "CandidateDocument" (id, "agencyId", "candidateId", "fileId", kind, "extractedText", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, 'resume', 'Jane Doe CV', now())`,
      [agency, candidateId, original.rows[0].id],
    );
    const resumeArtifact = await run((tx) =>
      findOrCreateArtifact(tx, {
        agencyId: agency,
        kind: 'tailored_resume',
        subject: { type: 'pipeline_entry', id: entry.id },
      }),
    );
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: resumeArtifact.id,
        content: { summary: 'Jane Doe, HR leader' },
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await run((tx) => setFactCheck(tx, v.id, { ranAt: NOW.toISOString(), warnings: [] }));
    await run((tx) => approveVersion(tx, rec, v.id));
    const pdf = await admin.query(
      `INSERT INTO "FileObject" (id, "agencyId", store, filename, "contentType", "sizeBytes", sha256, "updatedAt") VALUES (gen_random_uuid(), $1, 'db', 'resume.pdf', 'application/pdf', 4, $2, now()) RETURNING id`,
      [agency, randomUUID()],
    );
    await admin.query(
      `INSERT INTO "FileBlob" (id, "agencyId", "fileId", bytes) VALUES (gen_random_uuid(), $1, $2, $3)`,
      [agency, pdf.rows[0].id, Buffer.from('%PDF')],
    );
    await admin.query(
      `INSERT INTO "RenderedDocument" (id, "agencyId", "versionId", format, "contentHash", "fileId") VALUES (gen_random_uuid(), $1, $2, 'pdf', 'h', $3)`,
      [agency, v.id, pdf.rows[0].id],
    );
    await run((tx) =>
      recordResumeApproval(tx, rec, entry.id, {
        decision: 'approved',
        approverName: 'Jane Doe',
        method: 'email',
        decidedAt: new Date('2026-09-30T00:00:00Z'),
        comments: 'Looks right, Jane',
      }),
    );
    await admin.query(
      `INSERT INTO "OutboxMessage" (id, "agencyId", "toAddress", subject, "bodyHtml", "bodyText", kind, "entityType", "entityId", transport, status, "updatedAt") VALUES (gen_random_uuid(), $1, 'jane@example.com', 'Hello Jane', '<p>Hi Jane</p>', 'Hi Jane', 'outreach', 'pipeline_entry', $2, 'dev-capture', 'captured', now())`,
      [agency, entry.id],
    );
    await admin.query(
      `INSERT INTO "ActivityLog" (id, "agencyId", "actorType", action, "entityType", "entityId", data) VALUES (gen_random_uuid(), $1, 'user', 'candidate.updated', 'candidate', $2, '{"fullName":"Jane Doe"}')`,
      [agency, candidateId],
    );
    await admin.query(
      `INSERT INTO "CandidateNote" (id, "agencyId", "candidateId", "authorId", body, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, 'Jane prefers calls after 6pm', now())`,
      [agency, candidateId, rec.userId],
    );
    await admin.query(
      `UPDATE "PipelineTransition" SET reason = 'Jane said she is keen' WHERE "entryId" = $1`,
      [entry.id],
    );
    const interview = await admin.query(
      `INSERT INTO "Interview" (id, "agencyId", "entryId", "roundName", interviewers, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'HM', '{}', now()) RETURNING id`,
      [agency, entry.id],
    );
    await admin.query(
      `INSERT INTO "InterviewFeedback" (id, "agencyId", "interviewId", "fromRole", source, "technicalFit", comments, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'hm', 'recorded_by_recruiter', 'strong', 'Jane was sharp', now())`,
      [agency, interview.rows[0].id],
    );
    return {
      entry,
      candidateId,
      originalId: original.rows[0].id as string,
      pdfId: pdf.rows[0].id as string,
      versionId: v.id,
    };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    drHandle = dataRightsHandle();
    agency = await createAgency(admin, 'Privacy A');
    other = await createAgency(admin, 'Privacy B');
    const [u1, u2, u3] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ];
    for (const [u, role] of [
      [u1, 'admin'],
      [u2, 'lead'],
      [u3, 'recruiter'],
    ] as const) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
        [agency, u, role],
      );
    }
    boss = { kind: 'agency', userId: u1, agencyId: agency, role: 'admin' };
    lead = { kind: 'agency', userId: u2, agencyId: agency, role: 'lead' };
    rec = { kind: 'agency', userId: u3, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Privacy Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency, other] });
    await admin.end();
    await handle.close();
    await drHandle.close();
  });

  describe('requests and deadlines (T-0-06)', () => {
    it('records a request with a 45-day deadline and a reminder a week before', async () => {
      const { candidateId } = await readyMatchEntry(run, rec, clientId);
      const view = await run((tx) =>
        createPrivacyRequest(tx, lead, { candidateId, kind: 'export', note: 'By email' }, NOW),
      );
      expect(view).toMatchObject({ kind: 'export', status: 'requested', overdue: false });
      expect(view.deadlineAt.getTime()).toBe(NOW.getTime() + PRIVACY_DEADLINE_DAYS * DAY);
      const task = await run((tx) =>
        tx.task.findFirstOrThrow({ where: { kind: 'privacy_request', entityId: view.id } }),
      );
      expect(task.dueAt.getTime()).toBe(NOW.getTime() + (PRIVACY_DEADLINE_DAYS - 7) * DAY);
      await expect(
        run((tx) => createPrivacyRequest(tx, lead, { candidateId, kind: 'export' }, NOW)),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('is for leads and admins; only an admin carries it out; overdue shows once the deadline has passed', async () => {
      const { candidateId } = await readyMatchEntry(run, rec, clientId);
      await expect(
        run((tx) => createPrivacyRequest(tx, rec, { candidateId, kind: 'delete' }, NOW)),
      ).rejects.toMatchObject({ status: 403 });
      const view = await run((tx) =>
        createPrivacyRequest(tx, lead, { candidateId, kind: 'delete' }, NOW),
      );
      await expect(run((tx) => beginPrivacyRequest(tx, lead, view.id))).rejects.toMatchObject({
        status: 403,
      });
      const later = new Date(NOW.getTime() + 60 * DAY);
      const listed = (await run((tx) => listPrivacyRequests(tx, lead, later))).find(
        (r) => r.id === view.id,
      );
      expect(listed?.overdue).toBe(true);
      await run((tx) => rejectPrivacyRequest(tx, boss, view.id, 'Not the data subject', later));
      expect(
        (await run((tx) => listPrivacyRequests(tx, lead, later))).find((r) => r.id === view.id),
      ).toMatchObject({ status: 'rejected', overdue: false });
      const open = await run((tx) =>
        tx.task.count({ where: { entityId: view.id, completedAt: null } }),
      );
      expect(open).toBe(0);
    });

    it("never shows another agency's requests", async () => {
      expect(await appScope(handle).withAgency(other, (tx) => tx.privacyRequest.count())).toBe(0);
    });
  });

  describe('export (T-0-04)', () => {
    it('puts every row and file of the candidate in a ZIP and nothing of another candidate', async () => {
      const f = await fixture();
      const bystander = await readyMatchEntry(run, rec, clientId);
      const zipBytes = await run(async (tx) =>
        buildCandidateZip(
          await collectCandidateData(tx, f.candidateId),
          fileSourceFor(tx, null),
          NOW,
        ),
      );
      const zip = await JSZip.loadAsync(zipBytes);
      const json = JSON.parse(await zip.file('candidate.json')!.async('string'));
      expect(json.candidate.fullName).toBe('Alex Kim');
      expect(json.documents).toHaveLength(1);
      expect(json.artifactVersions.length).toBeGreaterThanOrEqual(1);
      expect(json.approvals[0].approverName).toBe('Jane Doe');
      expect(json.outbox[0].toAddress).toBe('jane@example.com');
      expect(json.interviews[0].feedback[0].comments).toBe('Jane was sharp');
      expect(json.notes[0].body).toBe('Jane prefers calls after 6pm');
      expect(
        Object.keys(zip.files)
          .filter((n) => n.startsWith('files/') && !n.endsWith('/'))
          .sort(),
      ).toEqual(['files/cv.txt', 'files/resume.pdf']);
      expect(await zip.file('files/cv.txt')!.async('string')).toBe('Jane Doe CV');
      expect(JSON.stringify(json)).not.toContain(bystander.candidateId);
    });

    it('the job stores the ZIP for download and closes the request', async () => {
      const f = await fixture();
      const view = await run((tx) =>
        createPrivacyRequest(tx, lead, { candidateId: f.candidateId, kind: 'export' }, NOW),
      );
      await run((tx) => beginPrivacyRequest(tx, boss, view.id));
      await runExportJob(
        {
          jobRunId: randomUUID(),
          agencyId: agency,
          requestedById: boss.userId,
          data: { requestId: view.id },
          attempt: 1,
          withAgency: run as never,
          progress: async () => undefined,
        },
        { store: null, now: NOW },
      );
      const done = (await run((tx) => listPrivacyRequests(tx, lead, NOW))).find(
        (r) => r.id === view.id,
      )!;
      expect(done.status).toBe('completed');
      const file = await run((tx) =>
        tx.fileObject.findUniqueOrThrow({ where: { id: done.fileId! } }),
      );
      expect(file).toMatchObject({ contentType: 'application/zip', store: 'db' });
      // The export leaves the candidate's data untouched.
      expect(
        (await admin.query(`SELECT "fullName" FROM "Candidate" WHERE id = $1`, [f.candidateId]))
          .rows[0].fullName,
      ).toBe('Alex Kim');
    });
  });

  describe('deletion (T-0-05)', () => {
    it('anonymizes the candidate across every table, keeps KPIs, and is repeatable', async () => {
      const f = await fixture();
      const bystander = await readyMatchEntry(run, rec, clientId);
      await run((tx) =>
        tx.pipelineEntry.update({
          where: { id: f.entry.id },
          data: { state: 'candidate_approved' },
        }),
      );
      const before = await count(
        `SELECT count(*)::int AS n FROM "PipelineTransition" WHERE "entryId" = $1`,
        [f.entry.id],
      );

      const result = await drScope().withAgency(agency, (tx) =>
        anonymizeCandidate(tx, f.candidateId, NOW),
      );
      expect(result.filesRemoved).toBe(2);

      const c = (await admin.query(`SELECT * FROM "Candidate" WHERE id = $1`, [f.candidateId]))
        .rows[0];
      expect(c).toMatchObject({
        fullName: DELETED_NAME,
        email: null,
        phone: null,
        profileUrl: null,
        currentTitle: null,
        location: null,
        skills: [],
        tags: [],
        phoneKey: null,
        employerKeys: [],
        status: 'discarded',
        source: 'linkedin',
      });
      expect(c.anonymizedAt).toBeInstanceOf(Date);
      expect(
        (
          await admin.query(`SELECT "searchText" IS NULL AS gone FROM "Candidate" WHERE id = $1`, [
            f.candidateId,
          ])
        ).rows[0].gone,
      ).toBe(true);

      expect(
        await count(`SELECT count(*)::int AS n FROM "CandidateNote" WHERE "candidateId" = $1`, [
          f.candidateId,
        ]),
      ).toBe(0);

      // Files, documents, artifacts, renders, analyses and embeddings are gone
      expect(
        await count(`SELECT count(*)::int AS n FROM "FileObject" WHERE id = ANY($1)`, [
          [f.originalId, f.pdfId],
        ]),
      ).toBe(0);
      expect(
        await count(`SELECT count(*)::int AS n FROM "FileBlob" WHERE "fileId" = ANY($1)`, [
          [f.originalId, f.pdfId],
        ]),
      ).toBe(0);
      expect(
        await count(`SELECT count(*)::int AS n FROM "CandidateDocument" WHERE "candidateId" = $1`, [
          f.candidateId,
        ]),
      ).toBe(0);
      expect(
        await count(`SELECT count(*)::int AS n FROM "ArtifactVersion" WHERE id = $1`, [
          f.versionId,
        ]),
      ).toBe(0);
      expect(
        await count(`SELECT count(*)::int AS n FROM "Artifact" WHERE "subjectId" = ANY($1)`, [
          [f.candidateId, f.entry.id],
        ]),
      ).toBe(0);
      expect(
        await count(`SELECT count(*)::int AS n FROM "MatchAnalysis" WHERE "entryId" = $1`, [
          f.entry.id,
        ]),
      ).toBe(0);
      expect(
        await count(`SELECT count(*)::int AS n FROM "RenderedDocument" WHERE "versionId" = $1`, [
          f.versionId,
        ]),
      ).toBe(0);

      // Audit rows stay, with the personal content redacted
      expect(
        await count(`SELECT count(*)::int AS n FROM "PipelineTransition" WHERE "entryId" = $1`, [
          f.entry.id,
        ]),
      ).toBe(before);
      expect(
        (
          await admin.query(`SELECT reason FROM "PipelineTransition" WHERE "entryId" = $1`, [
            f.entry.id,
          ])
        ).rows.every((r) => r.reason === null),
      ).toBe(true);
      expect(
        (
          await admin.query(`SELECT data FROM "ActivityLog" WHERE "entityId" = $1`, [f.candidateId])
        ).rows.every((r) => JSON.stringify(r.data) === '{"redacted":true}'),
      ).toBe(true);
      expect(
        (
          await admin.query(
            `SELECT "approverName", comments FROM "Approval" WHERE "subjectId" = $1`,
            [f.entry.id],
          )
        ).rows[0],
      ).toEqual({ approverName: 'Deleted', comments: null });
      expect(
        (
          await admin.query(
            `SELECT "toAddress", subject, "bodyText" FROM "OutboxMessage" WHERE "entityId" = $1`,
            [f.entry.id],
          )
        ).rows[0],
      ).toEqual({ toAddress: 'deleted', subject: '', bodyText: '' });
      expect(
        (
          await admin.query(
            `SELECT comments, "technicalFit" FROM "InterviewFeedback" WHERE "interviewId" IN (SELECT id FROM "Interview" WHERE "entryId" = $1)`,
            [f.entry.id],
          )
        ).rows[0],
      ).toEqual({ comments: null, technicalFit: 'strong' });
      // KPIs: the pipeline entry and its stage survive
      expect(
        (await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [f.entry.id])).rows[0]
          .state,
      ).toBe('candidate_approved');

      // Another candidate is untouched
      expect(
        (
          await admin.query(`SELECT "fullName" FROM "Candidate" WHERE id = $1`, [
            bystander.candidateId,
          ])
        ).rows[0].fullName,
      ).toBe('Alex Kim');
      expect(
        await count(`SELECT count(*)::int AS n FROM "Artifact" WHERE "subjectId" = $1`, [
          bystander.candidateId,
        ]),
      ).toBeGreaterThan(0);

      // Running it again changes nothing and does not fail
      const again = await drScope().withAgency(agency, (tx) =>
        anonymizeCandidate(tx, f.candidateId, NOW),
      );
      expect(again.filesRemoved).toBe(0);
    });

    it('keeps an original that another candidate also uses', async () => {
      const a = await fixture();
      const b = await readyMatchEntry(run, rec, clientId);
      await admin.query(
        `INSERT INTO "CandidateDocument" (id, "agencyId", "candidateId", "fileId", kind, "extractedText", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, 'resume', 'same bytes', now())`,
        [agency, b.candidateId, a.originalId],
      );
      await drScope().withAgency(agency, (tx) => anonymizeCandidate(tx, a.candidateId, NOW));
      expect(
        await count(`SELECT count(*)::int AS n FROM "FileObject" WHERE id = $1`, [a.originalId]),
      ).toBe(1);
      expect(
        await count(`SELECT count(*)::int AS n FROM "FileObject" WHERE id = $1`, [a.pdfId]),
      ).toBe(0);
    });

    it('cannot be done as the runtime role: audit rows are append-only for it', async () => {
      const f = await fixture();
      await expect(run((tx) => anonymizeCandidate(tx, f.candidateId, NOW))).rejects.toThrow(
        /permission denied|denied/i,
      );
    });

    it('the job removes the data, closes the request and a second run is harmless', async () => {
      const f = await fixture();
      const view = await run((tx) =>
        createPrivacyRequest(tx, lead, { candidateId: f.candidateId, kind: 'delete' }, NOW),
      );
      await run((tx) => beginPrivacyRequest(tx, boss, view.id));
      const ctx = {
        jobRunId: randomUUID(),
        agencyId: agency,
        requestedById: boss.userId,
        data: { requestId: view.id },
        attempt: 1,
        withAgency: run as never,
        progress: async () => undefined,
      };
      await runAnonymizeJob(ctx, { store: null, now: NOW, scope: drScope() });
      expect(
        (await run((tx) => listPrivacyRequests(tx, lead, NOW))).find((r) => r.id === view.id),
      ).toMatchObject({ status: 'completed', candidateName: DELETED_NAME });
      await runAnonymizeJob(ctx, { store: null, now: NOW, scope: drScope() });
      await expect(
        run((tx) =>
          createPrivacyRequest(tx, lead, { candidateId: f.candidateId, kind: 'export' }, NOW),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });
});
