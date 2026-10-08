// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { statusSnapshotSchema, type AgencyActor, type PortalActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import { transitionEntry } from '@/server/pipeline/service';
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
import { invitePortalUser } from './identity';
import { publishShare } from './publish';
import { refreshStatusShares } from './status-snapshot';
import { getMyShare, listMyShares } from './read';

describe.skipIf(!dbAvailable())('candidate status share (T-15-01, FR-CDP-05)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let lead: AgencyActor;
  let clientId: string;
  let candidateId: string;
  let otherCandidateId: string;
  let entryId: string;
  let portal: PortalActor;
  let portalUserId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const setLevel = async (level: 'off' | 'basic' | 'detailed') => {
    await admin.query(
      `UPDATE "Agency" SET settings = jsonb_build_object('candidateStatusLevel', $2::text) WHERE id = $1`,
      [agency, level],
    );
  };
  const mine = async () => {
    const [summary] = await run((tx) => listMyShares(tx, portal));
    const detail = await run((tx) => getMyShare(tx, portal, summary!.id));
    return statusSnapshotSchema.parse(detail.snapshot);
  };
  const putForward = async (id: string, state: string) => {
    await admin.query(`UPDATE "PipelineEntry" SET state = $2::"PipelineState" WHERE id = $1`, [
      id,
      state,
    ]);
    await admin.query(
      `INSERT INTO "PipelineTransition" (id, "agencyId", "entryId", "toState", "actorId") VALUES (gen_random_uuid(), $1, $2, 'submitted'::"PipelineState", $3)`,
      [agency, id, lead.userId],
    );
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Status A');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'lead'::"AgencyRole", true, now())`,
      [agency, u],
    );
    lead = { kind: 'agency', userId: u, agencyId: agency, role: 'lead' };
    clientId = (await run((tx) => createClient(tx, lead, { name: 'Status Client' }))).client.id;
    const made = await readyMatchEntry(run, lead, clientId);
    entryId = made.entry.id;
    candidateId = made.candidateId;
    await run((tx) =>
      tx.candidate.update({ where: { id: candidateId }, data: { email: 'alex@example.com' } }),
    );
    await putForward(entryId, 'submitted');
    // Another application that is still internal (not put forward), and another candidate's.
    await readyMatchEntry(run, lead, clientId);
    const other = await readyMatchEntry(run, lead, clientId);
    otherCandidateId = other.candidateId;
    await putForward(other.entry.id, 'interviewing');
    const link = await run((tx) =>
      invitePortalUser(tx, lead, { audience: 'candidate', candidateId }),
    );
    portalUserId = link.portalUserId;
    portal = { kind: 'portal', portalUserId, agencyId: agency, audience: 'candidate' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('shows the position and a general step at the basic level, and nothing else', async () => {
    await setLevel('basic');
    await run((tx) =>
      publishShare(tx, lead, { kind: 'status', portalUserId, subjectId: candidateId }),
    );
    const snap = await mine();
    expect(snap.level).toBe('basic');
    expect(snap.applications).toEqual([
      {
        positionTitle: 'Head of HR',
        clientName: null,
        step: 'submitted',
        since: null,
        interviews: null,
      },
    ]);
    // Nothing about the other candidate or the internal application.
    expect(JSON.stringify(snap)).not.toContain(otherCandidateId);
  });

  it('is refreshed in place when the pipeline moves, and shows more at the detailed level', async () => {
    await setLevel('detailed');
    await run((tx) => transitionEntry(tx, lead, entryId, { to: 'interviewing' }));
    const snap = await mine();
    expect(snap.level).toBe('detailed');
    expect(snap.applications[0]).toMatchObject({
      clientName: 'Status Client',
      step: 'interviewing',
      interviews: 0,
    });
    expect(snap.applications[0]!.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // One share, not a pile of copies.
    expect(await run((tx) => listMyShares(tx, portal))).toHaveLength(1);
  });

  it('never carries a reason, a score or feedback, even when the candidate is rejected', async () => {
    await run((tx) =>
      transitionEntry(tx, lead, entryId, {
        to: 'rejected',
        reasonCode: 'Skills do not match',
        reason: 'Secret client comment',
      }),
    );
    const snap = await mine();
    expect(snap.applications[0]!.step).toBe('closed');
    const text = JSON.stringify(snap);
    expect(text).not.toContain('Secret client comment');
    expect(text).not.toContain('Skills do not match');
  });

  it('refuses to share when the agency has turned it off, and withdraws an existing share', async () => {
    await setLevel('off');
    await expect(
      run((tx) => publishShare(tx, lead, { kind: 'status', portalUserId, subjectId: candidateId })),
    ).rejects.toMatchObject({ status: 409 });
    // The next refresh (any pipeline move of this candidate) withdraws the share that exists.
    expect(await run((tx) => listMyShares(tx, portal))).toHaveLength(1);
    await run((tx) => refreshStatusShares(tx, agency, candidateId));
    expect(await run((tx) => listMyShares(tx, portal))).toHaveLength(0);
  });

  it("only the candidate's own portal user can be sent it", async () => {
    await setLevel('basic');
    await expect(
      run((tx) =>
        publishShare(tx, lead, { kind: 'status', portalUserId, subjectId: otherCandidateId }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
