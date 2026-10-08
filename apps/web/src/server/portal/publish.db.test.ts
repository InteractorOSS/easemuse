// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  portalSnapshotSchema,
  submissionReportContentSchema,
  type AgencyActor,
  type PortalActor,
} from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  findOrCreateArtifact,
  setFactCheck,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { renderDocument, type RenderDeps } from '@/server/documents/render/service';
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
import { invitePortalUser } from './identity';
import { getMyShare, listMyShares, openMyShareFile } from './read';
import { listSharesFor, publishShare, revokeShare } from './publish';

const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...new Uint8Array(200).fill(65)]);

describe.skipIf(!dbAvailable())('publishing to the portals (ADR-003)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let other: string;
  let lead: AgencyActor;
  let clientId: string;
  let otherClientId: string;
  let hm: { portalUserId: string; actor: PortalActor };
  let hm2: { portalUserId: string; actor: PortalActor };
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const actorOf = (
    portalUserId: string,
    audience: 'hiring_manager' | 'candidate',
  ): PortalActor => ({ kind: 'portal', portalUserId, agencyId: agency, audience });

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
  /** A candidate ready to be submitted: report and resume approved with PDFs, candidate approval and consent on record. */
  const readyToSubmit = async () => {
    const { entry, positionId, candidateId } = await readyMatchEntry(run, lead, clientId);
    await run((tx) =>
      tx.pipelineEntry.update({ where: { id: entry.id }, data: { state: 'candidate_approved' } }),
    );
    const report = await approve(
      entry.id,
      'submission_report',
      submissionReportContentSchema.parse({
        overview: 'A strong fit.',
        recruiterAssessment: 'My pick.',
      }),
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
        approverName: 'Alex Kim',
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
    return { entryId: entry.id, positionId, candidateId };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Publish A');
    other = await createAgency(admin, 'Publish B');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'lead'::"AgencyRole", true, now())`,
      [agency, u],
    );
    lead = { kind: 'agency', userId: u, agencyId: agency, role: 'lead' };
    clientId = (await run((tx) => createClient(tx, lead, { name: 'Pub Client' }))).client.id;
    otherClientId = (await run((tx) => createClient(tx, lead, { name: 'Other Client' }))).client.id;
    const contact = async (cid: string, name: string, email: string) =>
      (
        await run((tx) =>
          tx.clientContact.create({
            data: { agencyId: agency, clientId: cid, name, email },
            select: { id: true },
          }),
        )
      ).id;
    const mk = async (cid: string, name: string, email: string) => {
      const link = await run((tx) =>
        invitePortalUser(
          tx,
          lead,
          { audience: 'hiring_manager', clientContactId: undefined as never },
          new Date(),
        ).catch(() => null),
      );
      void link;
      const clientContactId = await contact(cid, name, email);
      const l = await run((tx) =>
        invitePortalUser(tx, lead, { audience: 'hiring_manager', clientContactId }),
      );
      return { portalUserId: l.portalUserId, actor: actorOf(l.portalUserId, 'hiring_manager') };
    };
    hm = await mk(clientId, 'Ms. Park', 'park@client.test');
    hm2 = await mk(otherClientId, 'Mr. Lee', 'lee@other.test');
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency, other] });
    await admin.end();
    await handle.close();
  });

  it('shares the approved JD with the hiring manager of that client only', async () => {
    const { positionId } = await readyMatchEntry(run, lead, clientId);
    await expect(
      run((tx) =>
        publishShare(tx, lead, {
          kind: 'jd_for_approval',
          portalUserId: hm.portalUserId,
          subjectId: positionId,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await approveStructuredJd(run, lead, positionId);
    await expect(
      run((tx) =>
        publishShare(tx, lead, {
          kind: 'jd_for_approval',
          portalUserId: hm2.portalUserId,
          subjectId: positionId,
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const share = await run((tx) =>
      publishShare(tx, lead, {
        kind: 'jd_for_approval',
        portalUserId: hm.portalUserId,
        subjectId: positionId,
      }),
    );
    const mine = await run((tx) => listMyShares(tx, hm.actor));
    expect(mine.map((m) => m.id)).toContain(share.id);
    expect(await run((tx) => listMyShares(tx, hm2.actor))).toEqual([]);
    const detail = await run((tx) => getMyShare(tx, hm.actor, share.id));
    expect(detail.snapshot.kind).toBe('jd_for_approval');
    await expect(run((tx) => getMyShare(tx, hm2.actor, share.id))).rejects.toMatchObject({
      status: 404,
    });
  });

  it('a new share replaces the old one, which shows "updated on"; revoking hides it at once', async () => {
    const { positionId } = await readyMatchEntry(run, lead, clientId);
    await approveStructuredJd(run, lead, positionId);
    const first = await run((tx) =>
      publishShare(tx, lead, {
        kind: 'jd_for_approval',
        portalUserId: hm.portalUserId,
        subjectId: positionId,
      }),
    );
    const second = await run((tx) =>
      publishShare(tx, lead, {
        kind: 'jd_for_approval',
        portalUserId: hm.portalUserId,
        subjectId: positionId,
      }),
    );
    await expect(run((tx) => getMyShare(tx, hm.actor, first.id))).rejects.toMatchObject({
      status: 404,
    });
    expect((await run((tx) => getMyShare(tx, hm.actor, second.id))).updatedOn).not.toBeNull();
    await run((tx) => revokeShare(tx, lead, second.id));
    await expect(run((tx) => getMyShare(tx, hm.actor, second.id))).rejects.toMatchObject({
      status: 404,
    });
    const listed = await run((tx) => listSharesFor(tx, 'jd_for_approval', positionId));
    expect(listed.every((s) => s.revokedAt !== null)).toBe(true);
  });

  it('a submission carries the 14 sections and the two PDFs and nothing else, and sharing records it', async () => {
    const { entryId } = await readyToSubmit();
    const share = await run((tx) =>
      publishShare(tx, lead, {
        kind: 'submission',
        portalUserId: hm.portalUserId,
        subjectId: entryId,
      }),
    );
    expect(
      (await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [entryId])).rows[0]
        .state,
    ).toBe('submitted');
    expect(
      (await admin.query(`SELECT method FROM "Submission" WHERE "entryId" = $1`, [entryId])).rows[0]
        .method,
    ).toBe('portal');
    const { snapshot } = await run((tx) => getMyShare(tx, hm.actor, share.id));
    if (snapshot.kind !== 'submission') throw new Error('wrong kind');
    expect(snapshot.report.recruiterAssessment).toBe('My pick.');
    expect(Object.keys(snapshot.report)).toHaveLength(14);
    // Whitelist: nothing about scores, sourcing or recruiter notes can be in what the portal gets.
    const text = JSON.stringify(snapshot).toLowerCase();
    for (const word of [
      'overallscore',
      'criterionscores',
      'matchanalysis',
      'weights',
      'source',
      'screeningclass',
      'donotcontact',
    ]) {
      expect(text).not.toContain(word);
    }
    // Files: the share lists exactly two, and only those download.
    const ok1 = await run((tx) =>
      openMyShareFile(tx, null, hm.actor, share.id, snapshot.reportFile.fileId),
    );
    expect(ok1.kind).toBe('bytes');
    await run((tx) => openMyShareFile(tx, null, hm.actor, share.id, snapshot.resumeFile.fileId));
    const original = await admin.query(
      `SELECT id FROM "FileObject" WHERE "agencyId" = $1 AND id NOT IN ($2, $3) LIMIT 1`,
      [agency, snapshot.reportFile.fileId, snapshot.resumeFile.fileId],
    );
    if (original.rows[0]) {
      await expect(
        run((tx) => openMyShareFile(tx, null, hm.actor, share.id, original.rows[0].id)),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(
      run((tx) => openMyShareFile(tx, null, hm2.actor, share.id, snapshot.reportFile.fileId)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuses to share a submission with a contact of another client, or before the candidate is ready', async () => {
    const early = await readyMatchEntry(run, lead, clientId);
    await expect(
      run((tx) =>
        publishShare(tx, lead, {
          kind: 'submission',
          portalUserId: hm.portalUserId,
          subjectId: early.entry.id,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const { entryId } = await readyToSubmit();
    await expect(
      run((tx) =>
        publishShare(tx, lead, {
          kind: 'submission',
          portalUserId: hm2.portalUserId,
          subjectId: entryId,
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('shares the approved tailored resume with that candidate, and only that candidate', async () => {
    const { entryId, candidateId } = await readyToSubmit();
    await run((tx) =>
      tx.candidate.update({ where: { id: candidateId }, data: { email: 'alex@example.com' } }),
    );
    const link = await run((tx) =>
      invitePortalUser(tx, lead, { audience: 'candidate', candidateId }),
    );
    const cand = actorOf(link.portalUserId, 'candidate');
    const share = await run((tx) =>
      publishShare(tx, lead, {
        kind: 'tailored_resume',
        portalUserId: link.portalUserId,
        subjectId: entryId,
      }),
    );
    const detail = await run((tx) => getMyShare(tx, cand, share.id));
    expect(portalSnapshotSchema.parse(detail.snapshot).kind).toBe('tailored_resume');
    await expect(
      run((tx) =>
        publishShare(tx, lead, {
          kind: 'tailored_resume',
          portalUserId: hm.portalUserId,
          subjectId: entryId,
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(run((tx) => getMyShare(tx, hm.actor, share.id))).rejects.toMatchObject({
      status: 404,
    });
  });
});
