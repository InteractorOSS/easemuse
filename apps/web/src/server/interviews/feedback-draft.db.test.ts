// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { interviewFeedbackContentSchema, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, approveVersion } from '@/server/artifacts/service';
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
import { readyMatchEntry } from '@/test/match-fixtures';
import { getFeedbackDraft, planFeedbackDraft } from './feedback-draft';
import { createInterview } from './service';

describe.skipIf(!dbAvailable())('feedback from a pasted email (T-9-03, A17)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let entryId: string;
  let interviewId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const draft = (over: Record<string, unknown>) =>
    interviewFeedbackContentSchema.parse({
      fromRole: 'hm',
      ratings: {},
      comments: '',
      source: 'pasted',
      ...over,
    });
  const feedbackRows = async () =>
    (
      await admin.query(
        `SELECT * FROM "InterviewFeedback" WHERE "interviewId" = $1 ORDER BY "createdAt"`,
        [interviewId],
      )
    ).rows;

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Feedback A');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    const clientId = (await run((tx) => createClient(tx, rec, { name: 'Fb Client' }))).client.id;
    const { entry } = await readyMatchEntry(run, rec, clientId);
    entryId = entry.id;
    await run((tx) =>
      tx.pipelineEntry.update({ where: { id: entryId }, data: { state: 'submitted' } }),
    );
    interviewId = (
      await run((tx) =>
        createInterview(tx, rec, entryId, { roundName: 'HM round', interviewers: [] }),
      )
    ).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('sends the email without the candidate’s name or contact details', async () => {
    const plan = await run((tx) =>
      planFeedbackDraft(tx, rec, entryId, interviewId, {
        fromRole: 'hm',
        email:
          'Hi, Alex Kim was strong on leadership. Reach me at hm@client.test or +82 10 1234 5678.',
      }),
    );
    expect(plan.input.email).not.toContain('Alex');
    expect(plan.input.email).not.toContain('Kim');
    expect(plan.input.email).not.toContain('hm@client.test');
    expect(plan.input.email).toContain('the candidate was strong on leadership');
    expect(plan.input.position.title).toBe('Head of HR'.replace('HR', 'HR'));
    expect(await run((tx) => getFeedbackDraft(tx, rec, entryId, interviewId))).toMatchObject({
      artifactId: plan.artifactId,
      approvedVersionId: null,
    });
  });

  it('records nothing until the recruiter confirms every rating, then records it once', async () => {
    const { artifactId } = (await run((tx) => getFeedbackDraft(tx, rec, entryId, interviewId)))!;
    const unconfirmed = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId,
        origin: 'ai',
        createdById: rec.userId,
        content: draft({
          ratings: {
            leadershipFit: { rating: 'strong', evidence: 'Great leader', confirmed: false },
            industryExperience: { rating: 'gap', evidence: 'Thin', confirmed: true },
          },
          comments: 'Keen.',
        }),
      }),
    );
    await expect(run((tx) => approveVersion(tx, rec, unconfirmed.id))).rejects.toMatchObject({
      status: 409,
      code: 'fields_unconfirmed',
    });
    expect(await feedbackRows()).toHaveLength(0);

    const confirmed = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId,
        origin: 'human',
        createdById: rec.userId,
        content: draft({
          ratings: {
            leadershipFit: { rating: 'strong', evidence: 'Great leader', confirmed: true },
            industryExperience: { rating: 'gap', evidence: 'Thin', confirmed: true },
          },
          comments: 'Keen.',
        }),
      }),
    );
    await run((tx) => approveVersion(tx, rec, confirmed.id));
    const rows = await feedbackRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromRole: 'hm',
      source: 'recorded_by_recruiter',
      leadershipFit: 'strong',
      industryExperience: 'gap',
      technicalFit: null,
      comments: 'Keen.',
      artifactVersionId: confirmed.id,
    });
  });

  it('needs at least one rating or a comment', async () => {
    const { artifactId } = (await run((tx) => getFeedbackDraft(tx, rec, entryId, interviewId)))!;
    const blank = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId,
        origin: 'human',
        createdById: rec.userId,
        content: draft({}),
      }),
    );
    await expect(run((tx) => approveVersion(tx, rec, blank.id))).rejects.toMatchObject({
      status: 422,
    });
  });
});
