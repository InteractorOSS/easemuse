// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  qualificationContentSchema,
  submissionReportContentSchema,
  type AgencyActor,
} from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { reportDraftPrompt } from '@/server/ai/prompts/report-draft';
import {
  addDraftVersion,
  approveVersion,
  createArtifact,
  editDraft,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { recruiterAssessmentGuard } from '@/server/pipeline/guard-library';
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
import { generateReport, getReport, planReportDraft } from './report';

describe.skipIf(!dbAvailable())('submission report (T-8-01, T-8-02)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);

  const entryAt = async (state: 'qualified' | 'contacting') => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    await run((tx) => tx.pipelineEntry.update({ where: { id: entry.id }, data: { state } }));
    return entry;
  };
  const approveQualification = async (entryId: string) => {
    const artifact = await run((tx) =>
      createArtifact(tx, {
        agencyId: agency,
        kind: 'qualification',
        subject: { type: 'pipeline_entry', id: entryId },
      }),
    );
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: artifact.id,
        content: qualificationContentSchema.parse({
          fields: { compensation: { value: '180-190k', confirmed: true } },
        }),
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await run((tx) => approveVersion(tx, rec, v.id));
  };
  const fakes = (finding: string | null = null) => {
    const gateway = {
      run: async () => ({
        generationId: randomUUID(),
        output: { unsupported: finding ? [{ claim: finding, reason: 'not in the sources' }] : [] },
        draft: null,
      }),
    };
    const model = async (
      _p: 'report.draft',
      input: Parameters<typeof reportDraftPrompt.buildPrompt>[0],
      ctx: { artifactId?: string },
    ) => {
      const output = Object.fromEntries(
        Object.keys(submissionReportContentSchema.shape)
          .filter((k) => !['recruiterAssessment', 'missingInputs'].includes(k))
          .map((k) => [k, `text ${k}`]),
      );
      const content = reportDraftPrompt.toContent!(reportDraftPrompt.schema.parse(output), input);
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
    return { run: model as never, gateway: gateway as never, withAgency: run };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Report A');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Rep Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('waits until the candidate is qualified', async () => {
    const e = await entryAt('contacting');
    await expect(run((tx) => planReportDraft(tx, rec, e.id))).rejects.toMatchObject({
      status: 409,
    });
  });

  it('uses only reviewed and confirmed records and says which are missing', async () => {
    const e = await entryAt('qualified');
    const plan = await run((tx) => planReportDraft(tx, rec, e.id));
    expect(plan.input.analysis).toBeNull();
    expect(plan.input.qualification).toBeNull();
    expect(JSON.stringify(plan.input)).not.toMatch(/Alex Kim|alex@x/);
    await approveQualification(e.id);
    const after = await run((tx) => planReportDraft(tx, rec, e.id));
    expect(after.input.qualification?.compensation.value).toBe('180-190k');
    expect(after.sources.map((s) => s.label)).toEqual([
      'Confirmed profile',
      'Confirmed qualification',
    ]);
  });

  it('drafts sections 1-13 with section 14 empty; approval needs the assessment and every fact-check decision', async () => {
    const e = await entryAt('qualified');
    const result = await generateReport(fakes('Managed 500 people'), rec, e.id);
    expect(result.missingInputs).toEqual(['match_analysis', 'qualification']);
    const versionId = result.draft!.versionId;
    const stored = await run((tx) =>
      tx.artifactVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: { content: true, factCheck: true },
      }),
    );
    const content = submissionReportContentSchema.parse(stored.content);
    expect(content.recruiterAssessment).toBe('');
    expect(content.compensation).toBe('Not yet confirmed');
    const warnings = (stored.factCheck as { warnings: { id: string }[] }).warnings;
    const resolutions = Object.fromEntries(
      warnings.map((w) => [w.id, { kind: 'confirmed' as const, reason: 'Checked' }]),
    );
    // Section 14 first: nothing else matters until the recruiter writes it.
    await expect(
      run((tx) => approveVersion(tx, rec, versionId, { factCheckResolutions: resolutions })),
    ).rejects.toMatchObject({ code: 'missing_recruiter_assessment' });
    const edited = await run((tx) =>
      editDraft(tx, rec, versionId, {
        ...content,
        recruiterAssessment: 'Strong operator, my pick.',
      }),
    );
    await expect(run((tx) => approveVersion(tx, rec, edited.id))).rejects.toMatchObject({
      code: 'factcheck_unresolved',
    });
    await run((tx) => approveVersion(tx, rec, edited.id, { factCheckResolutions: resolutions }));
    expect((await run((tx) => getReport(tx, rec, e.id))).approvedVersionId).toBe(edited.id);
    expect(
      await run((tx) =>
        recruiterAssessmentGuard({ tx, entry: { ...e }, to: 'submitted' } as never),
      ),
    ).toBeNull();
  });

  it('refuses an AI-written assessment', async () => {
    const e = await entryAt('qualified');
    const plan = await run((tx) => planReportDraft(tx, rec, e.id));
    await expect(
      run((tx) =>
        addDraftVersion(tx, {
          agencyId: agency,
          artifactId: plan.artifactId,
          content: { recruiterAssessment: 'AI says yes' },
          origin: 'ai',
          createdById: rec.userId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'human_only_field' });
  });
});
