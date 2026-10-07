// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  findOrCreateArtifact,
  setFactCheck,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { consentGuard, resumeApprovalGuard } from '@/server/pipeline/guard-library';
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
import { getApprovals, listConsents, recordConsent, recordResumeApproval } from './approval';

describe.skipIf(!dbAvailable())('candidate approval and consent (T-7-04)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let other: AgencyActor;
  let lead: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const decision = (over = {}) => ({
    decision: 'approved' as const,
    approverName: 'Alex Kim',
    method: 'email' as const,
    decidedAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  });

  const approvedResume = async (entryId: string) => {
    const artifact = await run((tx) =>
      findOrCreateArtifact(tx, {
        agencyId: agency,
        kind: 'tailored_resume',
        subject: { type: 'pipeline_entry', id: entryId },
      }),
    );
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: artifact.id,
        content: { summary: randomUUID() },
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await run((tx) => setFactCheck(tx, v.id, { ranAt: new Date().toISOString(), warnings: [] }));
    await run((tx) => approveVersion(tx, rec, v.id));
    return v.id;
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Approval A');
    const [u1, u2, u3] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ];
    for (const [u, role] of [
      [u1, 'recruiter'],
      [u2, 'recruiter'],
      [u3, 'lead'],
    ] as const) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
        [agency, u, role],
      );
    }
    rec = { kind: 'agency', userId: u1, agencyId: agency, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId: agency, role: 'recruiter' };
    lead = { kind: 'agency', userId: u3, agencyId: agency, role: 'lead' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Appr Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('needs the tailored resume approved first, then binds the decision to that exact version', async () => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    await expect(
      run((tx) => recordResumeApproval(tx, rec, entry.id, decision())),
    ).rejects.toMatchObject({ status: 409 });
    const versionId = await approvedResume(entry.id);
    const view = await run((tx) => recordResumeApproval(tx, rec, entry.id, decision()));
    expect(view.resumeVersionId).toBe(versionId);
    expect(view.approvals[0]).toMatchObject({
      decision: 'approved',
      approverName: 'Alex Kim',
      current: true,
    });
    expect(
      await run((tx) => resumeApprovalGuard({ tx, entry: { ...entry }, to: 'submitted' } as never)),
    ).toBeNull();
  });

  it('a newly approved resume version is not covered by the earlier approval', async () => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    await approvedResume(entry.id);
    await run((tx) => recordResumeApproval(tx, rec, entry.id, decision()));
    await approvedResume(entry.id);
    const guard = await run((tx) =>
      resumeApprovalGuard({ tx, entry: { ...entry }, to: 'submitted' } as never),
    );
    expect(guard).toMatchObject({ guard: 'resumeApproval' });
    const view = await run((tx) => getApprovals(tx, rec, entry.id));
    expect(view.approvals[0]!.current).toBe(false);
  });

  it('a "changes requested" answer does not satisfy the guard', async () => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    await approvedResume(entry.id);
    await run((tx) =>
      recordResumeApproval(
        tx,
        rec,
        entry.id,
        decision({ decision: 'changes_requested', comments: 'Fix dates' }),
      ),
    );
    expect(
      await run((tx) => resumeApprovalGuard({ tx, entry: { ...entry }, to: 'submitted' } as never)),
    ).toMatchObject({ guard: 'resumeApproval' });
  });

  it('rejects a decision dated in the future', async () => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    await approvedResume(entry.id);
    await expect(
      run((tx) =>
        recordResumeApproval(
          tx,
          rec,
          entry.id,
          decision({ decidedAt: new Date(Date.now() + 86_400_000) }),
        ),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('keeps consent append-only: the latest decision wins, and a withdrawal blocks submission', async () => {
    const { entry, candidateId } = await readyMatchEntry(run, rec, clientId);
    const at = (iso: string) => new Date(iso);
    expect(
      await run((tx) => consentGuard({ tx, entry: { ...entry }, to: 'submitted' } as never)),
    ).toMatchObject({ guard: 'consent' });
    await run((tx) =>
      recordConsent(tx, rec, candidateId, {
        clientId,
        action: 'given',
        at: at('2026-09-01T00:00:00Z'),
        method: 'email',
      }),
    );
    expect(
      await run((tx) => consentGuard({ tx, entry: { ...entry }, to: 'submitted' } as never)),
    ).toBeNull();
    const after = await run((tx) =>
      recordConsent(tx, rec, candidateId, {
        clientId,
        action: 'withdrawn',
        at: at('2026-09-15T00:00:00Z'),
        method: 'phone',
      }),
    );
    expect(after.items.map((c) => c.action)).toEqual(['withdrawn', 'given']);
    expect(
      await run((tx) => consentGuard({ tx, entry: { ...entry }, to: 'submitted' } as never)),
    ).toMatchObject({ guard: 'consent' });
    expect((await run((tx) => listConsents(tx, candidateId))).items).toHaveLength(2);
  });

  it("limits who may record consent to the candidate's recruiter, a lead or an admin", async () => {
    const { candidateId } = await readyMatchEntry(run, rec, clientId);
    const input = {
      clientId,
      action: 'given' as const,
      at: new Date('2026-09-01T00:00:00Z'),
      method: 'email' as const,
    };
    await expect(run((tx) => recordConsent(tx, other, candidateId, input))).rejects.toMatchObject({
      status: 403,
    });
    await expect(run((tx) => recordConsent(tx, lead, candidateId, input))).resolves.toBeTruthy();
  });
});
