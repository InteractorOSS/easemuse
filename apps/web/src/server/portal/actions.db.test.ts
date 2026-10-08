// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { submissionReportContentSchema, type AgencyActor, type PortalActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  findOrCreateArtifact,
  setFactCheck,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { renderDocument, type RenderDeps } from '@/server/documents/render/service';
import { consentGuard, resumeApprovalGuard } from '@/server/pipeline/guard-library';
import { isJdApproved } from '@/server/positions/jd-approval';
import { recordConsent, recordResumeApproval } from '@/server/resume/approval';
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
import { readyMatchEntry } from '@/test/match-fixtures';
import {
  consentOverview,
  decideShare,
  giveFeedback,
  proposeDecision,
  requestPrivacy,
  setConsent,
} from './actions';
import { invitePortalUser } from './identity';
import { publishShare } from './publish';
import { listOpenProposals, resolveProposal } from './proposals';

const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...new Uint8Array(200).fill(65)]);

describe.skipIf(!dbAvailable())('what portal users can do (ADR-003, FR-HMP-05)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let lead: AgencyActor;
  let boss: AgencyActor;
  let clientId: string;
  let hm: PortalActor;
  let hm2: PortalActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const actor = (portalUserId: string, audience: 'hiring_manager' | 'candidate'): PortalActor => ({
    kind: 'portal',
    portalUserId,
    agencyId: agency,
    audience,
  });
  const dueTasks = async (kind: string, entityId: string) =>
    run((tx) => tx.task.count({ where: { kind, entityId, completedAt: null } }));

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
        createdById: lead.userId,
      }),
    );
    await run((tx) => setFactCheck(tx, v.id, { ranAt: new Date().toISOString(), warnings: [] }));
    await run((tx) => approveVersion(tx, lead, v.id));
    return v.id;
  };
  const submitted = async () => {
    const { entry, positionId, candidateId } = await readyMatchEntry(run, lead, clientId);
    await run((tx) =>
      tx.pipelineEntry.update({ where: { id: entry.id }, data: { state: 'candidate_approved' } }),
    );
    const report = await approve(
      entry.id,
      'submission_report',
      submissionReportContentSchema.parse({ overview: 'Fine.', recruiterAssessment: 'Mine.' }),
    );
    const resume = await approve(entry.id, 'tailored_resume', { summary: 'HR leader.' });
    const deps: RenderDeps = {
      withAgency: run,
      renderer: vi.fn(async () => PDF),
      store: null,
      baseUrl: 'http://app.test/',
      secret: 'test-secret',
    };
    await renderDocument(deps, {
      agencyId: agency,
      requestedById: lead.userId,
      kind: 'report',
      versionId: report,
    });
    await renderDocument(deps, {
      agencyId: agency,
      requestedById: lead.userId,
      kind: 'resume',
      versionId: resume,
    });
    await run((tx) =>
      recordResumeApproval(tx, lead, entry.id, {
        decision: 'approved',
        approverName: 'Alex',
        method: 'email',
        decidedAt: new Date('2026-09-30'),
      }),
    );
    await run((tx) =>
      recordConsent(tx, lead, candidateId, {
        clientId,
        action: 'given',
        at: new Date('2026-09-30'),
        method: 'email',
      }),
    );
    const share = await run((tx) =>
      publishShare(tx, lead, {
        kind: 'submission',
        portalUserId: hm.portalUserId,
        subjectId: entry.id,
      }),
    );
    return { entryId: entry.id, positionId, candidateId, shareId: share.id };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Actions A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const [u, role] of [
      [u1, 'lead'],
      [u2, 'admin'],
    ] as const) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
        [agency, u, role],
      );
    }
    lead = { kind: 'agency', userId: u1, agencyId: agency, role: 'lead' };
    boss = { kind: 'agency', userId: u2, agencyId: agency, role: 'admin' };
    clientId = (await run((tx) => createClient(tx, lead, { name: 'Act Client' }))).client.id;
    const otherClient = (await run((tx) => createClient(tx, lead, { name: 'Act Other' }))).client
      .id;
    const mk = async (cid: string, name: string, email: string) => {
      const contactId = (
        await run((tx) =>
          tx.clientContact.create({
            data: { agencyId: agency, clientId: cid, name, email },
            select: { id: true },
          }),
        )
      ).id;
      return actor(
        (
          await run((tx) =>
            invitePortalUser(tx, lead, { audience: 'hiring_manager', clientContactId: contactId }),
          )
        ).portalUserId,
        'hiring_manager',
      );
    };
    hm = await mk(clientId, 'Ms. Park', 'park@act.test');
    hm2 = await mk(otherClient, 'Mr. Lee', 'lee@act.test');
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  describe('the hiring manager and the JD', () => {
    it('approving records the approval for the version they saw, links it, and tells the recruiter', async () => {
      const { positionId } = await readyMatchEntry(run, lead, clientId);
      await approveStructuredJd(run, lead, positionId);
      const share = await run((tx) =>
        publishShare(tx, lead, {
          kind: 'jd_for_approval',
          portalUserId: hm.portalUserId,
          subjectId: positionId,
        }),
      );
      expect(await run((tx) => isJdApproved(tx, positionId))).toBe(false);
      await run((tx) => decideShare(tx, hm, share.id, 'approved', { comments: 'Good.' }));
      expect(await run((tx) => isJdApproved(tx, positionId))).toBe(true);
      const row = await admin.query(
        `SELECT source, "approverName", "portalUserId", comments FROM "Approval" WHERE subject = 'jd' AND "subjectId" = $1`,
        [positionId],
      );
      expect(row.rows[0]).toEqual({
        source: 'portal',
        approverName: 'Ms. Park',
        portalUserId: hm.portalUserId,
        comments: 'Good.',
      });
      expect(await dueTasks('approval_received', positionId)).toBe(1);
    });

    it('asking for changes leaves the JD unapproved; a newer JD makes the old share stale; others cannot decide', async () => {
      const { positionId } = await readyMatchEntry(run, lead, clientId);
      await approveStructuredJd(run, lead, positionId);
      const share = await run((tx) =>
        publishShare(tx, lead, {
          kind: 'jd_for_approval',
          portalUserId: hm.portalUserId,
          subjectId: positionId,
        }),
      );
      await run((tx) =>
        decideShare(tx, hm, share.id, 'changes_requested', { comments: 'Pay range is wrong.' }),
      );
      expect(await run((tx) => isJdApproved(tx, positionId))).toBe(false);
      await expect(
        run((tx) => decideShare(tx, hm2, share.id, 'approved', {})),
      ).rejects.toMatchObject({ status: 404 });
      await approveStructuredJd(run, lead, positionId, undefined);
      await expect(
        run((tx) => decideShare(tx, hm, share.id, 'approved', {})),
      ).rejects.toMatchObject({ code: 'stale_share' });
    });
  });

  describe('a submitted candidate', () => {
    it('a decision is only a proposal: the pipeline does not move until the recruiter confirms', async () => {
      const s = await submitted();
      await run((tx) => proposeDecision(tx, hm, s.shareId, { decision: 'interview' }));
      expect(
        (await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [s.entryId])).rows[0]
          .state,
      ).toBe('submitted');
      expect(await dueTasks('proposal', s.entryId)).toBe(1);
      await expect(
        run((tx) => proposeDecision(tx, hm, s.shareId, { decision: 'reject', reason: 'No fit' })),
      ).rejects.toMatchObject({ status: 409 });
      const open = (await run((tx) => listOpenProposals(tx, lead))).find(
        (p) => p.entryId === s.entryId,
      )!;
      expect(open).toMatchObject({ toState: 'interviewing', proposedBy: 'Ms. Park' });
      const answered = await run((tx) => resolveProposal(tx, lead, open.id, { accept: true }));
      // The hiring manager is told that the recommendation was answered (T-14-07), without the answer.
      const notice = (
        await admin.query(`SELECT * FROM "OutboxMessage" WHERE id = $1`, [
          answered.notificationMessageId,
        ])
      ).rows[0];
      expect(notice.bodyText).toContain('has answered your recommendation');
      expect(notice.bodyText).not.toContain('interview');
      expect(
        (await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [s.entryId])).rows[0]
          .state,
      ).toBe('interviewing');
      expect(await dueTasks('proposal', s.entryId)).toBe(0);
      await expect(
        run((tx) => resolveProposal(tx, lead, open.id, { accept: true })),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('declining a proposal leaves the candidate where they were; a rejection needs a reason code to accept', async () => {
      const s = await submitted();
      await run((tx) =>
        proposeDecision(tx, hm, s.shareId, { decision: 'reject', reason: 'Not senior enough' }),
      );
      const open = (await run((tx) => listOpenProposals(tx, lead))).find(
        (p) => p.entryId === s.entryId,
      )!;
      expect(open.toState).toBe('client_rejected');
      await expect(
        run((tx) => resolveProposal(tx, lead, open.id, { accept: true })),
      ).rejects.toMatchObject({ status: 422 });
      await run((tx) => resolveProposal(tx, lead, open.id, { accept: false }));
      expect(
        (await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [s.entryId])).rows[0]
          .state,
      ).toBe('submitted');
      expect(
        (await admin.query(`SELECT accepted FROM "ProposedTransition" WHERE id = $1`, [open.id]))
          .rows[0].accepted,
      ).toBe(false);
    });

    it('a reject needs a reason, hold does not apply before an interview, and another hiring manager cannot act', async () => {
      const s = await submitted();
      await expect(
        run((tx) => proposeDecision(tx, hm, s.shareId, { decision: 'hold', reason: 'Wait' })),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        run((tx) => proposeDecision(tx, hm2, s.shareId, { decision: 'interview' })),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('feedback needs an interview round, then lands on the newest one marked as from the portal', async () => {
      const s = await submitted();
      await expect(
        run((tx) => giveFeedback(tx, hm, s.shareId, { ratings: { technicalFit: 'strong' } })),
      ).rejects.toMatchObject({ status: 409 });
      const interview = await admin.query(
        `INSERT INTO "Interview" (id, "agencyId", "entryId", "roundName", interviewers, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'HM', '{}', now()) RETURNING id`,
        [agency, s.entryId],
      );
      await run((tx) =>
        giveFeedback(tx, hm, s.shareId, {
          ratings: { technicalFit: 'strong', industryExperience: 'gap' },
          comments: 'Needs retail depth',
        }),
      );
      const rows = await admin.query(
        `SELECT source, "fromRole", "technicalFit", comments FROM "InterviewFeedback" WHERE "interviewId" = $1`,
        [interview.rows[0].id],
      );
      expect(rows.rows).toEqual([
        {
          source: 'portal',
          fromRole: 'hm',
          technicalFit: 'strong',
          comments: 'Needs retail depth',
        },
      ]);
    });
  });

  describe('the candidate', () => {
    const candidatePortal = async (candidateId: string) => {
      await run((tx) =>
        tx.candidate.update({
          where: { id: candidateId },
          data: { email: `c-${candidateId.slice(0, 6)}@example.com` },
        }),
      );
      return actor(
        (await run((tx) => invitePortalUser(tx, lead, { audience: 'candidate', candidateId })))
          .portalUserId,
        'candidate',
      );
    };

    it('approving the resume satisfies the same guard as the recorded path, bound to the version they saw', async () => {
      const { entry, candidateId } = await readyMatchEntry(run, lead, clientId);
      const resume = await approve(entry.id, 'tailored_resume', { summary: 'HR leader.' });
      const cand = await candidatePortal(candidateId);
      const share = await run((tx) =>
        publishShare(tx, lead, {
          kind: 'tailored_resume',
          portalUserId: cand.portalUserId,
          subjectId: entry.id,
        }),
      );
      expect(
        await run((tx) =>
          resumeApprovalGuard({ tx, entry: { ...entry }, to: 'submitted' } as never),
        ),
      ).toMatchObject({ guard: 'resumeApproval' });
      await run((tx) => decideShare(tx, cand, share.id, 'approved', {}));
      expect(
        await run((tx) =>
          resumeApprovalGuard({ tx, entry: { ...entry }, to: 'submitted' } as never),
        ),
      ).toBeNull();
      const a = await admin.query(
        `SELECT source, "versionId", "approverName" FROM "Approval" WHERE "subjectId" = $1`,
        [entry.id],
      );
      expect(a.rows[0]).toMatchObject({ source: 'portal', versionId: resume });
      await expect(
        run((tx) => decideShare(tx, hm, share.id, 'approved', {})),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('gives and withdraws consent only for clients they were put forward to, appending rows', async () => {
      const { entry, candidateId } = await readyMatchEntry(run, lead, clientId);
      const cand = await candidatePortal(candidateId);
      expect(
        (await run((tx) => consentOverview(tx, cand))).map((c) => [c.clientName, c.current]),
      ).toEqual([['Act Client', null]]);
      await run((tx) => setConsent(tx, cand, { clientId, action: 'given' }));
      expect(
        await run((tx) => consentGuard({ tx, entry: { ...entry }, to: 'submitted' } as never)),
      ).toBeNull();
      await run((tx) => setConsent(tx, cand, { clientId, action: 'withdrawn' }));
      expect(
        await run((tx) => consentGuard({ tx, entry: { ...entry }, to: 'submitted' } as never)),
      ).toMatchObject({ guard: 'consent' });
      const other = (await run((tx) => createClient(tx, lead, { name: 'Never Seen' }))).client.id;
      await expect(
        run((tx) => setConsent(tx, cand, { clientId: other, action: 'given' })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(run((tx) => consentOverview(tx, hm))).rejects.toMatchObject({ status: 403 });
    });

    it('asks for their data or its deletion: tracked with a deadline, reminders for every admin, one open request per kind', async () => {
      const { candidateId } = await readyMatchEntry(run, lead, clientId);
      const cand = await candidatePortal(candidateId);
      const { id } = await run((tx) =>
        requestPrivacy(tx, cand, { kind: 'delete', note: 'Please delete' }),
      );
      const row = await admin.query(
        `SELECT source, status, "deadlineAt" > now() AS future FROM "PrivacyRequest" WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]).toMatchObject({
        source: 'candidate_portal',
        status: 'requested',
        future: true,
      });
      expect(
        await run((tx) =>
          tx.task.count({ where: { kind: 'privacy_request', entityId: id, ownerId: boss.userId } }),
        ),
      ).toBe(1);
      await expect(run((tx) => requestPrivacy(tx, cand, { kind: 'delete' }))).rejects.toMatchObject(
        { status: 409 },
      );
      await expect(run((tx) => requestPrivacy(tx, hm, { kind: 'export' }))).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});
