// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tailoredResumeContentSchema, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { resumeTailorPrompt } from '@/server/ai/prompts/resume-tailor';
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
import { generateTailoredResume, getTailoredResume, planTailoredResume } from './tailor';

describe.skipIf(!dbAvailable())('tailored resume (T-7-01, T-7-02)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);

  const entryAt = async (state: 'qualified' | 'interested') => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    await run((tx) => tx.pipelineEntry.update({ where: { id: entry.id }, data: { state } }));
    return entry;
  };

  /** A gateway stand-in: stores the draft like the real one and answers the verifier with one finding. */
  const fakes = (finding: string | null) => {
    const calls: string[] = [];
    const gateway = {
      run: async (purpose: string) => {
        calls.push(purpose);
        return {
          generationId: randomUUID(),
          output: {
            unsupported: finding ? [{ claim: finding, reason: 'not in the sources' }] : [],
          },
          draft: null,
        };
      },
    };
    const model = async (
      _p: 'resume.tailor',
      input: Parameters<typeof resumeTailorPrompt.buildPrompt>[0],
      ctx: { subject?: { type: 'pipeline_entry'; id: string }; artifactId?: string },
    ) => {
      const output = {
        summary: 'HR leader with payroll depth.',
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
      return {
        generationId: randomUUID(),
        output,
        draft,
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        costUsd: 0,
      };
    };
    return { calls, deps: { run: model as never, gateway: gateway as never, withAgency: run } };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Resume A');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'R Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('waits until the candidate is qualified', async () => {
    const e = await entryAt('interested');
    await expect(run((tx) => planTailoredResume(tx, rec, e.id, false))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('sends the profile without identity and checks the draft against the profile and the original resume', async () => {
    const e = await entryAt('qualified');
    const plan = await run((tx) => planTailoredResume(tx, rec, e.id, false));
    expect(JSON.stringify(plan.input.profile)).not.toMatch(/Alex Kim|alex@x/);
    expect(plan.input.header.name).toBe('Alex Kim');
    expect(plan.sources.map((s) => s.label)).toEqual(['Confirmed profile']);
    const candidate = await run((tx) =>
      tx.pipelineEntry.findUniqueOrThrow({ where: { id: e.id }, select: { candidateId: true } }),
    );
    const file = await admin.query(
      `INSERT INTO "FileObject" (id, "agencyId", store, filename, "contentType", "sizeBytes", sha256, "updatedAt") VALUES (gen_random_uuid(), $1, 'db', 'cv.txt', 'text/plain', 1, 'x', now()) RETURNING id`,
      [agency],
    );
    await admin.query(
      `INSERT INTO "CandidateDocument" (id, "agencyId", "candidateId", "fileId", kind, "extractedText", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, 'resume', 'Original CV text', now())`,
      [agency, candidate.candidateId, file.rows[0].id],
    );
    const again = await run((tx) => planTailoredResume(tx, rec, e.id, false));
    expect(again.sources.map((s) => s.label)).toEqual(['Confirmed profile', 'Original resume']);
  });

  it('stores the fact-check warnings with the draft; approving needs each one decided, then records the version', async () => {
    const e = await entryAt('qualified');
    const { calls, deps } = fakes('Led a team of 200');
    const result = await generateTailoredResume(deps, rec, e.id, false);
    expect(calls).toEqual(['factcheck.verify']);
    expect(result.warnings).toBeGreaterThanOrEqual(1);
    const versionId = result.draft!.versionId;
    await expect(run((tx) => approveVersion(tx, rec, versionId))).rejects.toMatchObject({
      code: 'factcheck_unresolved',
    });
    const stored = await run((tx) =>
      tx.artifactVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: { factCheck: true },
      }),
    );
    const warnings = (stored.factCheck as { warnings: { id: string }[] }).warnings;
    await run((tx) =>
      approveVersion(tx, rec, versionId, {
        factCheckResolutions: Object.fromEntries(
          warnings.map((w) => [w.id, { kind: 'confirmed', reason: 'Checked with the candidate' }]),
        ),
      }),
    );
    const rows = await admin.query(
      `SELECT "versionId", blind, "approvalId" FROM "TailoredResume" WHERE "entryId" = $1`,
      [e.id],
    );
    expect(rows.rows).toEqual([{ versionId, blind: false, approvalId: null }]);
    const view = await run((tx) => getTailoredResume(tx, rec, e.id));
    expect(view).toMatchObject({ approvedVersionId: versionId, blind: false });
    const content = tailoredResumeContentSchema.parse(
      (
        await run((tx) =>
          tx.artifactVersion.findUniqueOrThrow({
            where: { id: versionId },
            select: { content: true },
          }),
        )
      ).content,
    );
    expect(content.roles[0]).toMatchObject({ company: 'Northwind', original: expect.any(String) });
  });
});
