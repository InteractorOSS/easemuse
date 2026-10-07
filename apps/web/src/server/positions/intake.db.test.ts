// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INTAKE_TOPICS, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { approveStructuredJd, structuredJdContent } from '@/test/jd-fixtures';
import { getIntake, recordJdApproval, saveIntake } from './intake';
import { changeStatus, createPosition } from './service';

describe.skipIf(!dbAvailable())(
  'intake record, JD approval and the sourcing guard (T-1-09)',
  () => {
    let admin: pg.Client;
    let handle: DbHandle;
    let agencyId: string;
    let agencyB: string;
    let owner: AgencyActor;
    let other: AgencyActor;
    let outsider: AgencyActor;
    let clientId: string;
    type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
    const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
    const newPosition = async () =>
      (await run((tx) => createPosition(tx, owner, { clientId, title: 'Role', location: 'Seoul' })))
        .id;
    const decide = (
      positionId: string,
      decision: 'approved' | 'changes_requested',
      decidedAt = new Date(),
    ) =>
      run((tx) =>
        recordJdApproval(tx, owner, positionId, {
          decision,
          approverName: 'Hana Choi',
          method: 'email',
          decidedAt,
        }),
      );
    const toIntake = (positionId: string) =>
      run((tx) => changeStatus(tx, owner, positionId, { status: 'intake' }));
    const toSourcing = (
      positionId: string,
      overrideGuards?: { guard: 'jdApproval'; reason: string }[],
    ) =>
      run((tx) =>
        changeStatus(tx, owner, positionId, {
          status: 'sourcing',
          ...(overrideGuards ? { overrideGuards } : {}),
        }),
      );
    const setGuardMode = (mode: 'block' | 'warn') =>
      admin.query(
        `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{guardModes}', $2::jsonb) WHERE id = $1`,
        [
          agencyId,
          JSON.stringify({
            jdApproval: mode,
            resumeApproval: 'block',
            consent: 'block',
            recruiterAssessment: 'block',
          }),
        ],
      );

    beforeAll(async () => {
      admin = await adminClient();
      handle = appHandle(2);
      agencyId = await createAgency(admin, 'Intake A');
      agencyB = await createAgency(admin, 'Intake B');
      const [u1, u2, u3] = [
        await createUser(admin),
        await createUser(admin),
        await createUser(admin),
      ];
      for (const u of [u1, u2]) {
        await admin.query(
          `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
          [agencyId, u],
        );
      }
      owner = { kind: 'agency', userId: u1, agencyId, role: 'recruiter' };
      other = { kind: 'agency', userId: u2, agencyId, role: 'recruiter' };
      outsider = { kind: 'agency', userId: u3, agencyId: agencyB, role: 'recruiter' };
      clientId = (await run((tx) => createClient(tx, owner, { name: 'Intake Client' }))).client.id;
    });
    afterAll(async () => {
      await cleanup(admin, { agencies: [agencyId, agencyB] });
      await admin.end();
      await handle.close();
    });

    describe('intake record', () => {
      it('has the ten topics of the brief', () => {
        expect(INTAKE_TOPICS).toHaveLength(10);
      });

      it('starts empty, saves topics as accepted recruiter answers, and merges later saves', async () => {
        const id = await newPosition();
        expect((await run((tx) => getIntake(tx, owner, id))).answers).toEqual({});
        await run((tx) =>
          saveIntake(tx, owner, id, {
            answers: {
              business_reason: { value: 'Replace a leaver' },
              interview_process: {
                value: 'Three rounds',
                stages: ['Screen', 'Technical', 'Panel'],
              },
            },
          }),
        );
        const view = await run((tx) =>
          saveIntake(tx, owner, id, { answers: { expected_timeline: { value: 'By March' } } }),
        );
        expect(view.answers.business_reason).toEqual({
          value: 'Replace a leaver',
          source: 'recruiter',
          status: 'accepted',
        });
        expect(view.answers.interview_process?.stages).toEqual(['Screen', 'Technical', 'Panel']);
        expect(view.answers.expected_timeline?.value).toBe('By March');
        expect(Object.keys(view.answers)).toHaveLength(3);
      });

      it('lets only the owner (or a lead) save, anyone who can see it read, and keeps agencies apart', async () => {
        const id = await newPosition();
        await expect(
          run((tx) => saveIntake(tx, other, id, { answers: { business_reason: { value: 'x' } } })),
        ).rejects.toMatchObject({ status: 403 });
        expect((await run((tx) => getIntake(tx, other, id))).answers).toEqual({});
        await expect(
          appScope(handle).withAgency(agencyB, (tx) => getIntake(tx, outsider, id)),
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('recording the hiring manager decision', () => {
      it('needs an approved structured JD first, and a date that is not in the future', async () => {
        const id = await newPosition();
        await expect(decide(id, 'approved')).rejects.toMatchObject({ status: 409 });
        await approveStructuredJd(run, owner, id);
        await expect(
          decide(id, 'approved', new Date(Date.now() + 86_400_000)),
        ).rejects.toMatchObject({ status: 422 });
      });

      it('records the decision against the approved version and links it to the intake record', async () => {
        const id = await newPosition();
        const version = await approveStructuredJd(run, owner, id);
        const approval = await decide(id, 'approved');
        expect(approval).toMatchObject({
          decision: 'approved',
          source: 'recorded_by_recruiter',
          method: 'email',
          versionId: version,
          current: true,
        });
        const view = await run((tx) => getIntake(tx, owner, id));
        expect(view.jdApproval).toMatchObject({ id: approval.id, current: true });
        const row = await admin.query(
          `SELECT "jdApprovalId", "recordedById" FROM "IntakeRecord" r, "Approval" a WHERE r."positionId" = $1 AND a.id = r."jdApprovalId"`,
          [id],
        );
        expect(row.rows[0]).toMatchObject({
          jdApprovalId: approval.id,
          recordedById: owner.userId,
        });
      });

      it('marks an earlier decision as out of date once the JD is edited and approved again', async () => {
        const id = await newPosition();
        await approveStructuredJd(run, owner, id);
        await decide(id, 'approved');
        await approveStructuredJd(
          run,
          owner,
          id,
          structuredJdContent([{ id: randomUUID(), text: 'New', category: 'must_have' }]),
        );
        expect((await run((tx) => getIntake(tx, owner, id))).jdApproval?.current).toBe(false);
      });
    });

    describe('guard: sourcing needs the hiring manager approval', () => {
      it('blocks by default, saying why, and does not move the position', async () => {
        const id = await newPosition();
        await toIntake(id);
        await expect(toSourcing(id)).rejects.toMatchObject({
          status: 409,
          code: 'guard_failed',
          guards: [{ guard: 'jdApproval', mode: 'block' }],
        });
        // An override does not help while the guard is set to block.
        await expect(
          toSourcing(id, [{ guard: 'jdApproval', reason: 'Client is in a hurry' }]),
        ).rejects.toMatchObject({ code: 'guard_failed' });
        expect((await run((tx) => tx.position.findUniqueOrThrow({ where: { id } }))).status).toBe(
          'intake',
        );
      });

      it('lets it through once the decision is "approved"', async () => {
        const id = await newPosition();
        await toIntake(id);
        await approveStructuredJd(run, owner, id);
        await expect(toSourcing(id)).rejects.toMatchObject({ code: 'guard_failed' }); // approved JD, but no decision yet
        await decide(id, 'changes_requested');
        await expect(toSourcing(id)).rejects.toMatchObject({ code: 'guard_failed' });
        await decide(
          id,
          'approved',
          new Date(Date.now() + 1000 > Date.now() ? Date.now() : 0) as Date,
        );
        expect((await toSourcing(id)).status).toBe('sourcing');
      });

      it('needs a new decision after the JD changes', async () => {
        const id = await newPosition();
        await toIntake(id);
        await approveStructuredJd(run, owner, id);
        await decide(id, 'approved');
        await approveStructuredJd(
          run,
          owner,
          id,
          structuredJdContent([{ id: randomUUID(), text: 'Changed', category: 'must_have' }]),
        );
        await expect(toSourcing(id)).rejects.toMatchObject({ code: 'guard_failed' });
      });

      it('in warn mode goes ahead only with an override reason, and logs it', async () => {
        await setGuardMode('warn');
        try {
          const id = await newPosition();
          await toIntake(id);
          await expect(toSourcing(id)).rejects.toMatchObject({
            code: 'guard_failed',
            guards: [{ guard: 'jdApproval', mode: 'warn' }],
          });
          expect(
            (
              await toSourcing(id, [
                { guard: 'jdApproval', reason: 'HM approved by phone, will record later' },
              ])
            ).status,
          ).toBe('sourcing');
          const log = await admin.query(
            `SELECT data FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'position.status_changed' AND data->>'to' = 'sourcing'`,
            [id],
          );
          expect(log.rows[0].data.overriddenGuards).toEqual([
            { guard: 'jdApproval', reason: 'HM approved by phone, will record later' },
          ]);
        } finally {
          await admin.query(
            `UPDATE "Agency" SET settings = settings - 'guardModes' WHERE id = $1`,
            [agencyId],
          );
        }
      });

      it('does not apply to holds, cancellations or moves between later stages', async () => {
        const id = await newPosition();
        await toIntake(id);
        expect(
          (await run((tx) => changeStatus(tx, owner, id, { status: 'on_hold', reason: 'Waiting' })))
            .status,
        ).toBe('on_hold');
        expect(
          (
            await run((tx) =>
              changeStatus(tx, owner, id, { status: 'cancelled', reason: 'Client withdrew' }),
            )
          ).status,
        ).toBe('cancelled');
      });
    });
  },
);
