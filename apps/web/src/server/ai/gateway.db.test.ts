// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import type { ModelClient, ModelRequest } from './anthropic';
import { AiCancelledError, AiProviderError, AiRefusalError } from './errors';
import { createGateway } from './gateway';
import { getProvenance } from './provenance';
import { createPromptRegistry } from './prompts';

const outputSchema = z.object({ title: z.string() });
const USAGE = { inputTokens: 1_000, outputTokens: 500, cachedTokens: 0 };

describe.skipIf(!dbAvailable())('AI gateway (ADR-004)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let otherAgencyId: string;
  let actor: AgencyActor;
  const positionId = randomUUID();
  const subject = { type: 'position' as const, id: positionId };
  const calls: ModelRequest<unknown>[] = [];
  let behaviour: (
    request: ModelRequest<unknown>,
  ) => Promise<{ parsed: unknown; usage: typeof USAGE; stopReason: string; latencyMs: number }>;

  const model: ModelClient = {
    async complete<T>(request: ModelRequest<T>) {
      calls.push(request as ModelRequest<unknown>);
      return behaviour(request as ModelRequest<unknown>) as never;
    },
  };
  const ok =
    (parsed: unknown = { title: 'Senior Engineer' }, usage = USAGE) =>
    async () => ({ parsed, usage, stopReason: 'end_turn', latencyMs: 120 });

  function gateway(prompts = registry()) {
    return createGateway({ scope: appScope(handle), model, prompts });
  }
  function registry() {
    const prompts = createPromptRegistry();
    prompts.register({
      purpose: 'jd.structure',
      version: 'jd-structure-v1',
      schema: outputSchema,
      buildPrompt: (input: { text: string }) => ({
        system: 'System prompt',
        user: `JD: ${input.text}`,
      }),
    });
    return prompts;
  }
  const baseCtx = () => ({
    agencyId,
    actor,
    positionId,
    subject,
    inputRefs: { positionId, jdVersion: 3 },
  });
  const scope = () => appScope(handle);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(4);
    agencyId = await createAgency(admin, 'AI Agency');
    otherAgencyId = await createAgency(admin, 'Other');
    actor = { kind: 'agency', userId: randomUUID(), agencyId, role: 'recruiter' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId, otherAgencyId] });
    await admin.end();
    await handle.close();
  });

  it('runs a purpose end to end: prompt, call, ledger, provenance and an AI draft', async () => {
    calls.length = 0;
    behaviour = ok();
    const result = await gateway().run<{ text: string }, { title: string }>(
      'jd.structure',
      { text: 'We need an engineer' },
      baseCtx(),
    );

    // The model got the routed model, explicit effort and the built prompt.
    expect(calls[0]).toMatchObject({
      model: 'claude-opus-5-5',
      effort: 'medium',
      system: 'System prompt',
      user: 'JD: We need an engineer',
      maxTokens: 16_000,
    });
    expect(result.output).toEqual({ title: 'Senior Engineer' });
    expect(result.draft).toMatchObject({ version: 1 });
    expect(result.costUsd).toBe(0.014); // 1000 in * $4 + 500 out * $20 per million

    const generation = (
      await admin.query(`SELECT * FROM "AiGeneration" WHERE id = $1`, [result.generationId])
    ).rows[0];
    expect(generation).toMatchObject({
      agencyId,
      purpose: 'jd.structure',
      requestedById: actor.userId,
      promptVersion: 'jd-structure-v1',
      model: 'claude-opus-5-5',
      status: 'succeeded',
      error: null,
    });
    expect(generation.inputRefs).toEqual({ positionId, jdVersion: 3 });

    const llm = (
      await admin.query(`SELECT * FROM "LlmCall" WHERE "aiGenerationId" = $1`, [
        result.generationId,
      ])
    ).rows;
    expect(llm).toHaveLength(1);
    expect(llm[0]).toMatchObject({
      purpose: 'jd.structure',
      model: 'claude-opus-5-5',
      inputTokens: 1000,
      outputTokens: 500,
      cachedTokens: 0,
      latencyMs: 120,
      positionId,
      requestedById: actor.userId,
    });
    expect(Number(llm[0].costUsd)).toBe(0.014);

    const version = (
      await admin.query(`SELECT * FROM "ArtifactVersion" WHERE id = $1`, [result.draft!.versionId])
    ).rows[0];
    expect(version).toMatchObject({
      status: 'draft',
      origin: 'ai',
      aiGenerationId: result.generationId,
      createdById: actor.userId,
    });
    expect(version.content).toEqual({ title: 'Senior Engineer' });
  });

  it('adds later drafts to the same artifact for the same subject, or to an explicit artifact', async () => {
    behaviour = ok({ title: 'Second' });
    const first = await gateway().run(
      'jd.structure',
      { text: 'a' },
      { ...baseCtx(), subject: { type: 'position', id: randomUUID() } },
    );
    const again = await gateway().run(
      'jd.structure',
      { text: 'b' },
      { ...baseCtx(), artifactId: first.draft!.artifactId },
    );
    expect(again.draft).toMatchObject({ artifactId: first.draft!.artifactId, version: 2 });
  });

  it('streams text to the caller', async () => {
    behaviour = async (request) => {
      request.onDelta?.('{"title":');
      request.onDelta?.('"X"}');
      return ok({ title: 'X' })();
    };
    const deltas: string[] = [];
    await gateway().run(
      'jd.structure',
      { text: 'a' },
      { ...baseCtx(), onDelta: (d) => deltas.push(d) },
    );
    expect(deltas).toEqual(['{"title":', '"X"}']);
  });

  describe('who may ask (FR-AI-01)', () => {
    it('refuses to run for a system actor or an actor from another agency, without any record', async () => {
      const before = (
        await admin.query(`SELECT count(*)::int AS n FROM "AiGeneration" WHERE "agencyId" = $1`, [
          agencyId,
        ])
      ).rows[0].n;
      behaviour = ok();
      calls.length = 0;
      await expect(
        gateway().run(
          'jd.structure',
          { text: 'a' },
          { ...baseCtx(), actor: { kind: 'system', agencyId } },
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        gateway().run(
          'jd.structure',
          { text: 'a' },
          { ...baseCtx(), actor: { ...actor, agencyId: otherAgencyId } },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(calls).toHaveLength(0);
      const after = (
        await admin.query(`SELECT count(*)::int AS n FROM "AiGeneration" WHERE "agencyId" = $1`, [
          agencyId,
        ])
      ).rows[0].n;
      expect(after).toBe(before);
    });

    it('rejects unknown purposes, unimplemented purposes and a missing subject', async () => {
      const g = gateway();
      await expect(g.run('nope' as never, {}, baseCtx())).rejects.toMatchObject({ status: 422 });
      await expect(g.run('match.analyze', {}, baseCtx())).rejects.toMatchObject({
        status: 501,
        code: 'ai_not_available',
      });
      await expect(
        g.run('jd.structure', { text: 'a' }, { ...baseCtx(), subject: undefined }),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('failures leave existing data unchanged (FR-AI-07)', () => {
    const counts = async () => ({
      versions: (
        await admin.query(
          `SELECT count(*)::int AS n FROM "ArtifactVersion" WHERE "agencyId" = $1`,
          [agencyId],
        )
      ).rows[0].n as number,
      llm: (
        await admin.query(`SELECT count(*)::int AS n FROM "LlmCall" WHERE "agencyId" = $1`, [
          agencyId,
        ])
      ).rows[0].n as number,
    });
    const lastGeneration = async () =>
      (
        await admin.query(
          `SELECT status, error FROM "AiGeneration" WHERE "agencyId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
          [agencyId],
        )
      ).rows[0];

    it('a refusal saves no draft, but records the tokens it cost, and says so plainly', async () => {
      behaviour = async () => {
        throw new AiRefusalError('refusal', USAGE);
      };
      const before = await counts();
      await expect(gateway().run('jd.structure', { text: 'a' }, baseCtx())).rejects.toMatchObject({
        status: 422,
        code: 'ai_refused',
      });
      const after = await counts();
      expect(after.versions).toBe(before.versions);
      expect(after.llm).toBe(before.llm + 1);
      expect(await lastGeneration()).toEqual({ status: 'failed', error: 'ai_refused' });
    });

    it('a provider outage saves nothing and costs nothing', async () => {
      behaviour = async () => {
        throw new AiProviderError('provider error 503', true, 503);
      };
      const before = await counts();
      await expect(gateway().run('jd.structure', { text: 'a' }, baseCtx())).rejects.toMatchObject({
        status: 503,
        code: 'ai_unavailable',
      });
      expect(await counts()).toEqual(before);
      expect(await lastGeneration()).toEqual({ status: 'failed', error: 'ai_unavailable' });
    });

    it('a cancelled request is marked cancelled and saves no draft', async () => {
      behaviour = async () => {
        throw new AiCancelledError('cancelled');
      };
      const before = await counts();
      await expect(gateway().run('jd.structure', { text: 'a' }, baseCtx())).rejects.toMatchObject({
        code: 'ai_cancelled',
      });
      expect((await counts()).versions).toBe(before.versions);
      expect(await lastGeneration()).toEqual({ status: 'cancelled', error: 'cancelled' });
    });

    it('an answer the artifact cannot store keeps the cost but drops the draft', async () => {
      // The model returns a field only a person may write on a submission report.
      const prompts = createPromptRegistry();
      prompts.register({
        purpose: 'report.draft',
        version: 'report-v1',
        schema: z.object({ recruiterAssessment: z.string() }),
        buildPrompt: () => ({ system: 's', user: 'u' }),
      });
      behaviour = ok({ recruiterAssessment: 'The AI wrote my opinion' });
      const before = await counts();
      await expect(
        gateway(prompts).run(
          'report.draft',
          {},
          { ...baseCtx(), subject: { type: 'pipeline_entry', id: randomUUID() } },
        ),
      ).rejects.toMatchObject({ code: 'human_only_field' });
      const after = await counts();
      expect(after.versions).toBe(before.versions);
      expect(after.llm).toBe(before.llm + 1);
      expect((await lastGeneration()).status).toBe('failed');
    });
  });

  describe('budget gate (ADR-013, US-1304)', () => {
    const setBudget = (usd: number | null) =>
      admin.query(`UPDATE "Agency" SET "aiMonthlyBudgetUsd" = $1 WHERE id = $2`, [usd, agencyId]);
    const spend = (usd: number) =>
      scope().withAgency(agencyId, (tx) =>
        tx.llmCall.create({
          data: {
            agencyId,
            purpose: 'seed',
            model: 'claude-opus-5-5',
            promptVersion: 'x',
            inputTokens: 0,
            outputTokens: 0,
            costUsd: usd,
            latencyMs: 1,
          },
        }),
      );

    it('answers 402 over budget, before any model call or provenance record', async () => {
      const spent = Number(
        (
          await admin.query(
            `SELECT coalesce(sum("costUsd"),0) AS s FROM "LlmCall" WHERE "agencyId" = $1`,
            [agencyId],
          )
        ).rows[0].s,
      );
      await setBudget(spent + 1);
      await spend(1); // exactly at the limit
      behaviour = ok();
      calls.length = 0;
      const before = (
        await admin.query(`SELECT count(*)::int AS n FROM "AiGeneration" WHERE "agencyId" = $1`, [
          agencyId,
        ])
      ).rows[0].n;
      await expect(gateway().run('jd.structure', { text: 'a' }, baseCtx())).rejects.toMatchObject({
        status: 402,
        code: 'budget_exceeded',
      });
      expect(calls).toHaveLength(0);
      expect(
        (
          await admin.query(`SELECT count(*)::int AS n FROM "AiGeneration" WHERE "agencyId" = $1`, [
            agencyId,
          ])
        ).rows[0].n,
      ).toBe(before);
    });

    it('keeps working below the limit and when no limit is set', async () => {
      await setBudget(1_000_000);
      behaviour = ok();
      await expect(gateway().run('jd.structure', { text: 'a' }, baseCtx())).resolves.toBeTruthy();
      await setBudget(null);
      await expect(gateway().run('jd.structure', { text: 'a' }, baseCtx())).resolves.toBeTruthy();
    });

    it("counts only this agency's spend", async () => {
      await setBudget(0.0001);
      await scope().withAgency(otherAgencyId, (tx) =>
        tx.llmCall.create({
          data: {
            agencyId: otherAgencyId,
            purpose: 'seed',
            model: 'claude-opus-5-5',
            promptVersion: 'x',
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 9999,
            latencyMs: 1,
          },
        }),
      );
      await setBudget(null);
      behaviour = ok();
      await expect(gateway().run('jd.structure', { text: 'a' }, baseCtx())).resolves.toBeTruthy();
    });
  });

  it('shows provenance: requester, model, prompt version, inputs, cost and the versions it produced', async () => {
    behaviour = ok({ title: 'Provenance' });
    const result = await gateway().run('jd.structure', { text: 'a' }, baseCtx());
    const provenance = await scope().withAgency(agencyId, (tx) =>
      getProvenance(tx, result.generationId),
    );
    expect(provenance).toMatchObject({
      id: result.generationId,
      purpose: 'jd.structure',
      status: 'succeeded',
      requestedById: actor.userId,
      promptVersion: 'jd-structure-v1',
      model: 'claude-opus-5-5',
      inputRefs: { positionId, jdVersion: 3 },
      totalCostUsd: 0.014,
    });
    expect(provenance.calls).toHaveLength(1);
    expect(provenance.versions).toEqual([
      {
        artifactId: result.draft!.artifactId,
        versionId: result.draft!.versionId,
        version: result.draft!.version,
        status: 'draft',
      },
    ]);
    // The record never holds prompt or document text.
    expect(JSON.stringify(provenance)).not.toContain('System prompt');
  });

  it("hides another agency's provenance (404)", async () => {
    behaviour = ok();
    const result = await gateway().run('jd.structure', { text: 'a' }, baseCtx());
    await expect(
      scope().withAgency(otherAgencyId, (tx) => getProvenance(tx, result.generationId)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('records each model call in the ledger with the agency and position it belongs to', async () => {
    behaviour = ok(
      { title: 'Ledger' },
      { inputTokens: 2_000, outputTokens: 100, cachedTokens: 8_000 },
    );
    const result = await gateway().run('jd.structure', { text: 'a' }, baseCtx());
    const row = (
      await admin.query(
        `SELECT "cachedTokens", "costUsd", "positionId" FROM "LlmCall" WHERE "aiGenerationId" = $1`,
        [result.generationId],
      )
    ).rows[0];
    expect(row.cachedTokens).toBe(8_000);
    expect(row.positionId).toBe(positionId);
    expect(Number(row.costUsd)).toBe(0.0132); // 2000*$4 + 8000*$0.4 + 100*$20, per million
  });
});
