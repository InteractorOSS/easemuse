// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  candidateProfileContentSchema,
  REPORT_SECTIONS,
  portalSnapshotSchema,
  type AgencyActor,
  type PortalActor,
} from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  createArtifact,
  readApproved,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { getIntake, resolveIntakeProposal, saveIntake } from '@/server/positions/intake';
import { createScope } from '@/lib/db';
import { anonymizeCandidate } from '@/server/privacy/anonymize';
import { collectCandidateData } from '@/server/privacy/export';
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
import { invitePortalUser } from './identity';
import { listMyUpdates, proposeCandidateUpdate, proposeSlots, submitIntakeAnswers } from './extras';
import { publishShare } from './publish';
import {
  listCandidateUpdates,
  listOpenSlotProposals,
  resolveCandidateUpdate,
  resolveSlotProposal,
} from './resolve-extras';
import { getMyShare } from './read';

const DAY = 86_400_000;

/** The portal extras (FR-HMP-03, FR-HMP-06, FR-CDP-04): everything arrives as a proposal the recruiter accepts. */
describe.skipIf(!dbAvailable())(
  'portal extras: intake answers, interview times, candidate updates',
  () => {
    let admin: pg.Client;
    let handle: DbHandle;
    let agency: string;
    let lead: AgencyActor;
    let clientId: string;
    let hm: PortalActor;
    let hmOther: PortalActor;
    type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
    const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
    const portal = (
      portalUserId: string,
      audience: 'hiring_manager' | 'candidate',
    ): PortalActor => ({
      kind: 'portal',
      portalUserId,
      agencyId: agency,
      audience,
    });
    const openTasks = (entityId: string) =>
      run((tx) => tx.task.count({ where: { kind: 'proposal', entityId, completedAt: null } }));

    beforeAll(async () => {
      admin = await adminClient();
      handle = appHandle(2);
      agency = await createAgency(admin, 'Extras A');
      const u1 = await createUser(admin);
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'lead'::"AgencyRole", true, now())`,
        [agency, u1],
      );
      lead = { kind: 'agency', userId: u1, agencyId: agency, role: 'lead' };
      clientId = (await run((tx) => createClient(tx, lead, { name: 'Extras Client' }))).client.id;
      const otherClient = (await run((tx) => createClient(tx, lead, { name: 'Extras Other' })))
        .client.id;
      const mk = async (cid: string, name: string, email: string) => {
        const contact = await run((tx) =>
          tx.clientContact.create({
            data: { agencyId: agency, clientId: cid, name, email },
            select: { id: true },
          }),
        );
        const link = await run((tx) =>
          invitePortalUser(tx, lead, { audience: 'hiring_manager', clientContactId: contact.id }),
        );
        return portal(link.portalUserId, 'hiring_manager');
      };
      hm = await mk(clientId, 'Ms. Park', 'park@extras.test');
      hmOther = await mk(otherClient, 'Mr. Lee', 'lee@extras.test');
    });
    afterAll(async () => {
      await cleanup(admin, { agencies: [agency] });
      await admin.end();
      await handle.close();
    });

    describe('the hiring manager answers the intake questionnaire (T-14-09)', () => {
      let positionId: string;
      let shareId: string;

      beforeAll(async () => {
        ({ positionId } = await readyMatchEntry(run, lead, clientId));
        const artifact = await run((tx) =>
          createArtifact(tx, {
            agencyId: agency,
            kind: 'intake_questions',
            subject: { type: 'position', id: positionId },
          }),
        );
        const question = (id: string, topic: string, text: string) => ({
          id,
          topic,
          question: text,
          reason: '',
        });
        const approved = await run((tx) =>
          addDraftVersion(tx, {
            agencyId: agency,
            artifactId: artifact.id,
            content: { questions: [question('q1', 'business_reason', 'Why is this role open?')] },
            origin: 'human',
            createdById: lead.userId,
          }),
        );
        await run((tx) => approveVersion(tx, lead, approved.id));
        await run((tx) =>
          addDraftVersion(tx, {
            agencyId: agency,
            artifactId: artifact.id,
            content: {
              questions: [question('q2', 'business_reason', 'AN UNAPPROVED DRAFT QUESTION')],
            },
            origin: 'ai',
            createdById: lead.userId,
          }),
        );
        shareId = (
          await run((tx) =>
            publishShare(tx, lead, {
              kind: 'intake_form',
              portalUserId: hm.portalUserId,
              subjectId: positionId,
            }),
          )
        ).id;
      });

      it('shares the ten topics with the approved questions only, and only with a contact of the client', async () => {
        const { snapshot } = await run((tx) => getMyShare(tx, hm, shareId));
        const parsed = portalSnapshotSchema.parse(snapshot);
        expect(parsed.kind).toBe('intake_form');
        if (parsed.kind !== 'intake_form') return;
        expect(parsed.topics).toHaveLength(10);
        expect(parsed.topics.find((t) => t.key === 'business_reason')!.questions).toEqual([
          'Why is this role open?',
        ]);
        expect(JSON.stringify(parsed)).not.toContain('UNAPPROVED');
        await expect(
          run((tx) =>
            publishShare(tx, lead, {
              kind: 'intake_form',
              portalUserId: hmOther.portalUserId,
              subjectId: positionId,
            }),
          ),
        ).rejects.toMatchObject({ status: 403 });
      });

      it('stores answers as proposals beside the intake, changes nothing, and tells the recruiter', async () => {
        await run((tx) =>
          saveIntake(tx, lead, positionId, {
            answers: { business_reason: { value: 'Backfill, decided by the recruiter' } },
          }),
        );
        await run((tx) =>
          submitIntakeAnswers(tx, hm, shareId, {
            answers: {
              business_reason: { value: 'Growth of the Seoul team' },
              interview_process: { value: 'Two rounds', stages: ['Phone', 'Panel'] },
            },
          }),
        );
        const view = await run((tx) => getIntake(tx, lead, positionId));
        expect(view.answers.business_reason).toMatchObject({
          value: 'Backfill, decided by the recruiter',
          source: 'recruiter',
          status: 'accepted',
        });
        expect(view.answers.interview_process).toBeUndefined();
        expect(view.proposals.map((p) => p.topic)).toEqual([
          'business_reason',
          'interview_process',
        ]);
        expect(view.proposals[0]).toMatchObject({
          proposedBy: 'Ms. Park',
          value: 'Growth of the Seoul team',
        });
        expect(await openTasks(positionId)).toBe(1);
        // nothing that feeds later steps changed: only accepted answers are used by A5
      });

      it('accepting copies one answer in as "from the hiring manager" and keeps the others waiting', async () => {
        const view = await run((tx) =>
          resolveIntakeProposal(tx, lead, positionId, { topic: 'interview_process', accept: true }),
        );
        expect(view.answers.interview_process).toMatchObject({
          value: 'Two rounds',
          stages: ['Phone', 'Panel'],
          source: 'hm_portal',
          status: 'accepted',
        });
        expect(view.proposals.map((p) => p.topic)).toEqual(['business_reason']);
        expect(await openTasks(positionId)).toBe(1);
      });

      it('declining removes the proposal, keeps the recruiter answer, and closes the reminder', async () => {
        const view = await run((tx) =>
          resolveIntakeProposal(tx, lead, positionId, { topic: 'business_reason', accept: false }),
        );
        expect(view.answers.business_reason).toMatchObject({ source: 'recruiter' });
        expect(view.proposals).toEqual([]);
        expect(await openTasks(positionId)).toBe(0);
        await expect(
          run((tx) =>
            resolveIntakeProposal(tx, lead, positionId, { topic: 'business_reason', accept: true }),
          ),
        ).rejects.toMatchObject({ status: 404 });
      });

      it("refuses someone else's share, the wrong audience and a topic that was not asked", async () => {
        await expect(
          run((tx) =>
            submitIntakeAnswers(tx, hmOther, shareId, {
              answers: { business_reason: { value: 'x' } },
            }),
          ),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
          run((tx) =>
            submitIntakeAnswers(tx, portal(hm.portalUserId, 'candidate'), shareId, {
              answers: { business_reason: { value: 'x' } },
            }),
          ),
        ).rejects.toMatchObject({ status: 403 });
      });
    });

    describe('the hiring manager offers interview times (T-14-10)', () => {
      let entryId: string;
      let shareId: string;
      const future = (days: number) => new Date(Date.now() + days * DAY);

      beforeAll(async () => {
        const fixture = await readyMatchEntry(run, lead, clientId);
        entryId = fixture.entry.id;
        await run((tx) =>
          tx.pipelineEntry.update({ where: { id: entryId }, data: { state: 'submitted' } }),
        );
        const file = { fileId: randomUUID(), filename: 'x.pdf' };
        shareId = (
          await run((tx) =>
            tx.portalShare.create({
              data: {
                agencyId: agency,
                portalUserId: hm.portalUserId,
                kind: 'submission',
                subjectId: entryId,
                createdById: lead.userId,
                snapshot: {
                  kind: 'submission',
                  candidateName: 'Alex Kim',
                  positionTitle: 'Head of HR',
                  clientName: 'Extras Client',
                  report: Object.fromEntries(
                    [...REPORT_SECTIONS, 'recruiterAssessment'].map((k) => [k, 'Fine.']),
                  ),
                  reportFile: file,
                  resumeFile: file,
                  reportVersionId: randomUUID(),
                  resumeVersionId: randomUUID(),
                  submittedAt: new Date().toISOString(),
                  publishedAt: new Date().toISOString(),
                },
              },
            }),
          )
        ).id;
      });

      it('stores the offered times as a proposal; no round exists and the candidate does not move', async () => {
        const slots = [future(3), future(2), future(5)];
        await run((tx) =>
          proposeSlots(tx, hm, shareId, { slots, roundName: 'Panel interview', format: 'video' }),
        );
        const open = await run((tx) => listOpenSlotProposals(tx, lead));
        const mine = open.find((p) => p.entryId === entryId)!;
        expect(mine).toMatchObject({
          roundName: 'Panel interview',
          format: 'video',
          proposedBy: 'Ms. Park',
        });
        expect(mine.slots).toEqual(slots.map((s) => s.toISOString()).sort());
        expect(await run((tx) => tx.interview.count({ where: { entryId } }))).toBe(0);
        expect(
          (await run((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId } }))).state,
        ).toBe('submitted');
        expect(await openTasks(entryId)).toBe(1);
      });

      it('allows one offer at a time, only for times ahead', async () => {
        await expect(
          run((tx) => proposeSlots(tx, hm, shareId, { slots: [future(9)] })),
        ).rejects.toMatchObject({ status: 409 });
        const pending = (await run((tx) => listOpenSlotProposals(tx, lead))).find(
          (p) => p.entryId === entryId,
        )!;
        await run((tx) => resolveSlotProposal(tx, lead, pending.id, { decision: 'decline' }));
        await expect(
          run((tx) => proposeSlots(tx, hm, shareId, { slots: [new Date(Date.now() - DAY)] })),
        ).rejects.toMatchObject({ status: 422 });
      });

      it('confirming one time creates the round, moves the candidate to interviewing and closes the offer', async () => {
        const slots = [future(4), future(6)];
        await run((tx) => proposeSlots(tx, hm, shareId, { slots, format: 'onsite' }));
        const pending = (await run((tx) => listOpenSlotProposals(tx, lead))).find(
          (p) => p.entryId === entryId,
        )!;
        const { interviewId } = await run((tx) =>
          resolveSlotProposal(tx, lead, pending.id, {
            decision: 'confirm',
            slotIndex: 1,
            interviewers: ['Ms. Park'],
          }),
        );
        const round = await run((tx) =>
          tx.interview.findUniqueOrThrow({ where: { id: interviewId! } }),
        );
        expect(round).toMatchObject({
          entryId,
          format: 'onsite',
          interviewers: ['Ms. Park'],
          status: 'scheduled',
        });
        expect(round.scheduledAt!.toISOString()).toBe(slots[1]!.toISOString());
        expect(round.roundName).toMatch(/round 1/i);
        expect(
          (await run((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId } }))).state,
        ).toBe('interviewing');
        expect(await run((tx) => listOpenSlotProposals(tx, lead))).toEqual([]);
        expect(await openTasks(entryId)).toBe(0);
        await expect(
          run((tx) => resolveSlotProposal(tx, lead, pending.id, { decision: 'decline' })),
        ).rejects.toMatchObject({ status: 409 });
      });

      it('refuses a time that has passed since it was offered, and a time that was not offered', async () => {
        await run((tx) => proposeSlots(tx, hm, shareId, { slots: [future(1)] }));
        const pending = (await run((tx) => listOpenSlotProposals(tx, lead))).find(
          (p) => p.entryId === entryId,
        )!;
        await expect(
          run((tx) =>
            resolveSlotProposal(tx, lead, pending.id, {
              decision: 'confirm',
              slotIndex: 3,
              interviewers: [],
            }),
          ),
        ).rejects.toMatchObject({ status: 422 });
        await expect(
          run((tx) =>
            resolveSlotProposal(
              tx,
              lead,
              pending.id,
              { decision: 'confirm', slotIndex: 0, interviewers: [] },
              future(2),
            ),
          ),
        ).rejects.toMatchObject({ status: 409 });
      });

      it("refuses another client's hiring manager", async () => {
        await expect(
          run((tx) => proposeSlots(tx, hmOther, shareId, { slots: [future(2)] })),
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('the candidate updates their details (T-15-02)', () => {
      let candidateId: string;
      let me: PortalActor;
      beforeAll(async () => {
        const fixture = await readyMatchEntry(run, lead, clientId);
        candidateId = fixture.candidateId;
        const link = await run((tx) =>
          invitePortalUser(tx, lead, { audience: 'candidate', candidateId }),
        );
        me = portal(link.portalUserId, 'candidate');
      });

      it('stores what changed as a proposal and leaves the record alone', async () => {
        await run((tx) =>
          proposeCandidateUpdate(tx, me, {
            phone: '010-1111-2222',
            availability: 'From 1 December',
            compensationExpectation: 'KRW 150M',
          }),
        );
        const before = await run((tx) =>
          tx.candidate.findUniqueOrThrow({ where: { id: candidateId } }),
        );
        expect(before.phone).toBeNull();
        expect(before.availability).toBeNull();
        const mine = await run((tx) => listMyUpdates(tx, me));
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ status: 'waiting', changes: { phone: '010-1111-2222' } });
        expect(await openTasks(candidateId)).toBe(1);
        const log = await run((tx) =>
          tx.activityLog.findFirstOrThrow({
            where: { action: 'portal.candidate_update_proposed', entityId: candidateId },
          }),
        );
        expect(JSON.stringify(log.data)).not.toContain('010-1111');
      });

      it('a second submission corrects the waiting one instead of adding another', async () => {
        await run((tx) =>
          proposeCandidateUpdate(tx, me, {
            phone: '010-9999-0000',
            workAuthorization: 'Korean citizen',
          }),
        );
        const open = await run((tx) => listCandidateUpdates(tx, candidateId));
        expect(open).toHaveLength(1);
        expect(open[0]!.changes).toMatchObject({
          phone: '010-9999-0000',
          workAuthorization: 'Korean citizen',
          availability: 'From 1 December',
        });
      });

      it('accepting puts the details into the profile as a new approved version and marks analyses stale', async () => {
        await run((tx) => tx.matchAnalysis.deleteMany({}));
        const [update] = await run((tx) => listCandidateUpdates(tx, candidateId));
        await run((tx) => resolveCandidateUpdate(tx, lead, candidateId, update!.id, true));
        const row = await run((tx) =>
          tx.candidate.findUniqueOrThrow({ where: { id: candidateId } }),
        );
        expect(row).toMatchObject({ phone: '010-9999-0000', availability: 'From 1 December' });
        const profile = await run((tx) =>
          readApproved(tx, {
            kind: 'candidate_profile',
            subject: { type: 'candidate', id: candidateId },
          }),
        );
        const content = candidateProfileContentSchema.parse(profile!.content);
        expect(content).toMatchObject({
          phone: '010-9999-0000',
          compensationExpectation: 'KRW 150M',
          workAuthorization: 'Korean citizen',
          fullName: 'Alex Kim', // the rest of the profile is kept
        });
        expect(profile!.origin).toBe('human');
        expect((await run((tx) => listMyUpdates(tx, me)))[0]).toMatchObject({ status: 'accepted' });
        expect(await openTasks(candidateId)).toBe(0);
        await expect(
          run((tx) => resolveCandidateUpdate(tx, lead, candidateId, update!.id, true)),
        ).rejects.toMatchObject({ status: 409 });
      });

      it('declining changes nothing', async () => {
        await run((tx) => proposeCandidateUpdate(tx, me, { phone: '000-0000' }));
        const [update] = await run((tx) => listCandidateUpdates(tx, candidateId));
        await run((tx) => resolveCandidateUpdate(tx, lead, candidateId, update!.id, false));
        const row = await run((tx) =>
          tx.candidate.findUniqueOrThrow({ where: { id: candidateId } }),
        );
        expect(row.phone).toBe('010-9999-0000');
        expect((await run((tx) => listMyUpdates(tx, me)))[0]).toMatchObject({ status: 'declined' });
      });

      it('needs a confirmed profile for details that belong in it, but availability does not', async () => {
        const bare = await readyMatchEntry(run, lead, clientId, { approveProfile: false });
        await run((tx) =>
          tx.candidate.update({ where: { id: bare.candidateId }, data: { email: 'bare@x.test' } }),
        );
        const link = await run((tx) =>
          invitePortalUser(tx, lead, { audience: 'candidate', candidateId: bare.candidateId }),
        );
        const them = portal(link.portalUserId, 'candidate');
        await run((tx) => proposeCandidateUpdate(tx, them, { phone: '010-5555-5555' }));
        const [update] = await run((tx) => listCandidateUpdates(tx, bare.candidateId));
        await expect(
          run((tx) => resolveCandidateUpdate(tx, lead, bare.candidateId, update!.id, true)),
        ).rejects.toMatchObject({ status: 409 });
        expect(
          (await run((tx) => tx.candidate.findUniqueOrThrow({ where: { id: bare.candidateId } })))
            .phone,
        ).toBeNull();
        await run((tx) => resolveCandidateUpdate(tx, lead, bare.candidateId, update!.id, false));
        await run((tx) => proposeCandidateUpdate(tx, them, { availability: 'Now' }));
        const [again] = await run((tx) => listCandidateUpdates(tx, bare.candidateId));
        await run((tx) => resolveCandidateUpdate(tx, lead, bare.candidateId, again!.id, true));
        expect(
          (await run((tx) => tx.candidate.findUniqueOrThrow({ where: { id: bare.candidateId } })))
            .availability,
        ).toBe('Now');
      });

      it('a hiring manager cannot use the candidate actions', async () => {
        await expect(
          run((tx) => proposeCandidateUpdate(tx, hm as unknown as PortalActor, { phone: '1' })),
        ).rejects.toMatchObject({ status: 403 });
      });

      it('what a candidate said is part of their data export and is removed when they are deleted', async () => {
        const fixture = await readyMatchEntry(run, lead, clientId);
        await run((tx) =>
          tx.candidate.update({
            where: { id: fixture.candidateId },
            data: { email: 'gone@x.test' },
          }),
        );
        const link = await run((tx) =>
          invitePortalUser(tx, lead, { audience: 'candidate', candidateId: fixture.candidateId }),
        );
        await run((tx) =>
          proposeCandidateUpdate(tx, portal(link.portalUserId, 'candidate'), {
            phone: '010-7777-7777',
          }),
        );
        const data = await run((tx) => collectCandidateData(tx, fixture.candidateId));
        expect(data.candidateUpdates).toHaveLength(1);
        const dr = dataRightsHandle();
        try {
          await createScope(() => dr).withAgency(agency, (tx) =>
            anonymizeCandidate(tx, fixture.candidateId),
          );
        } finally {
          await dr.close();
        }
        expect(
          await run((tx) =>
            tx.candidateUpdateProposal.count({ where: { candidateId: fixture.candidateId } }),
          ),
        ).toBe(0);
      });
    });
  },
);
