// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { structuredJdContentSchema, type AgencyActor, type BenchmarkContent } from '@easemuse/core';
import { resetEnvForTests } from '@/lib/env';
import type { DbHandle } from '@/lib/db/client';
import type {
  ModelClient,
  ModelRequest,
  SearchRequest,
  SearchResponse,
} from '@/server/ai/anthropic';
import { createGateway } from '@/server/ai/gateway';
import { createPromptRegistry } from '@/server/ai/prompts';
import { marketBenchmarkPrompt } from '@/server/ai/prompts/market-benchmark';
import { approveVersion, findArtifact, getArtifactWithVersions } from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { createPosition, updatePosition } from '@/server/positions/service';
import { approveStructuredJd, structuredJdContent } from '@/test/jd-fixtures';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { decideSuggestion, getBenchmark, planBenchmark, runBenchmark } from './service';

describe.skipIf(!dbAvailable())('market benchmark (T-1-15, T-1-16)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let otherAgencyId: string;
  let actor: AgencyActor;
  let otherActor: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);

  const searches: SearchRequest[] = [];
  const completes: ModelRequest<unknown>[] = [];
  // The web step finds one cited page; the structuring step writes two findings (one cited, one not) and suggestions.
  const model: ModelClient = {
    async search(request): Promise<SearchResponse> {
      searches.push(request);
      return {
        findings: 'Typical pay is USD 130k to 160k. [S1]',
        sources: [
          {
            id: 'S1',
            url: 'https://jobs.example.com/be',
            title: 'Backend job',
            pageAge: 'May 2026',
            citedTexts: ['130,000 - 160,000'],
          },
        ],
        searches: 2,
        usage: { inputTokens: 3000, outputTokens: 800, cachedTokens: 0, webSearchRequests: 2 },
        latencyMs: 10,
      };
    },
    async complete<T>(request: ModelRequest<T>) {
      completes.push(request as ModelRequest<unknown>);
      const requirementId = /id=([\w-]+) \[/.exec(request.user)?.[1] ?? null;
      return {
        parsed: {
          web: [
            {
              ref: 'W1',
              category: 'compensation',
              text: 'Typical pay is USD 130k to 160k.',
              sourceIds: ['S1'],
            },
            { ref: 'W2', category: 'skill', text: 'Nobody cited this.', sourceIds: [] },
          ],
          suggestions: [
            {
              kind: 'add_requirement',
              section: 'technical_skills',
              text: 'Kubernetes experience',
              category: 'preferred',
              requirementId: null,
              rationale: 'Common in postings',
              basedOn: ['W1'],
            },
            {
              kind: 'update_section',
              section: 'compensation',
              text: 'USD 130k to 160k',
              category: null,
              requirementId: null,
              rationale: 'Market pay',
              basedOn: ['W1'],
            },
            {
              kind: 'change_requirement',
              section: 'technical_skills',
              text: 'Go 1.22+',
              category: 'must_have',
              requirementId,
              rationale: 'Our past roles',
              basedOn: ['O1'],
            },
          ],
        } as never,
        usage: { inputTokens: 2000, outputTokens: 600, cachedTokens: 0 },
        stopReason: 'end_turn',
        latencyMs: 20,
      };
    },
  };
  const gateway = () => {
    const prompts = createPromptRegistry();
    prompts.register(marketBenchmarkPrompt);
    return createGateway({ scope: appScope(handle), model, prompts });
  };

  /** A position with an approved structured JD (requirement r-go) and one similar past position. */
  async function setup() {
    const position = await run((tx) =>
      createPosition(tx, actor, { clientId, title: 'Backend Engineer', location: 'Seoul' }),
    );
    await run((tx) =>
      updatePosition(tx, actor, position.id, {
        compMin: 100_000,
        compMax: 120_000,
        compCurrency: 'USD',
        requiredSkills: ['Go'],
      }),
    );
    const past = await run((tx) =>
      createPosition(tx, actor, { clientId, title: 'Senior Backend Engineer', location: 'Busan' }),
    );
    await run((tx) =>
      updatePosition(tx, actor, past.id, {
        requiredSkills: ['Go'],
        compMin: 110_000,
        compMax: 150_000,
        compCurrency: 'USD',
      }),
    );
    await approveStructuredJd(
      run,
      actor,
      position.id,
      structuredJdContent([{ id: 'r-go', text: 'Go', category: 'must_have' }]),
    );
    return { positionId: position.id, pastId: past.id };
  }
  async function runAndApprove(positionId: string) {
    const plan = await run((tx) =>
      planBenchmark(tx, actor, positionId, new Date('2026-10-07T09:00:00Z')),
    );
    const result = await runBenchmark(gateway().run as never, actor, positionId, plan, {
      onDelta: () => undefined,
      signal: new AbortController().signal,
    });
    await run((tx) => approveVersion(tx, actor, result.draft!.versionId));
    return { plan, result, versionId: result.draft!.versionId };
  }

  beforeAll(async () => {
    process.env.WEB_SEARCH = 'on';
    resetEnvForTests();
    admin = await adminClient();
    handle = appHandle(4);
    agencyId = await createAgency(admin, 'Bench A');
    otherAgencyId = await createAgency(admin, 'Bench B');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'admin', true, now())`,
      [agencyId, u1],
    );
    actor = { kind: 'agency', userId: u1, agencyId, role: 'admin' };
    otherActor = { kind: 'agency', userId: u2, agencyId: otherAgencyId, role: 'admin' };
    clientId = (await run((tx) => createClient(tx, actor, { name: 'Bench Client' }))).client.id;
  });
  afterAll(async () => {
    delete process.env.WEB_SEARCH;
    resetEnvForTests();
    await cleanup(admin, { agencies: [agencyId, otherAgencyId] });
    await admin.end();
    await handle.close();
  });

  it('runs "Our data" and the cited web step, keeping the two apart, each web item with a link and a date', async () => {
    const { positionId, pastId } = await setup();
    searches.length = 0;
    completes.length = 0;
    const plan = await run((tx) =>
      planBenchmark(tx, actor, positionId, new Date('2026-10-07T09:00:00Z')),
    );
    expect(plan.input.ourData.flatMap((o) => o.positionIds)).toContain(pastId);
    expect(plan.inputRefs.webSearch).toBe('on');

    const result = await runBenchmark(gateway().run as never, actor, positionId, plan, {
      onDelta: () => undefined,
      signal: new AbortController().signal,
    });
    expect(searches).toHaveLength(1);
    expect(searches[0]!.maxUses).toBe(5);
    expect(searches[0]!.blockedDomains).toContain('gartner.com');
    expect(completes).toHaveLength(1);
    expect(completes[0]!.user).toContain('Typical pay is USD 130k to 160k. [S1]');

    const view = await run((tx) => getBenchmark(tx, actor, positionId));
    expect(view.versionStatus).toBe('draft'); // a draft until the recruiter approves it
    const content = view.content as BenchmarkContent;
    expect(content.ourData.length).toBeGreaterThan(0);
    expect(content.web).toHaveLength(1); // the uncited finding was dropped
    expect(content.droppedWebItems).toBe(1);
    expect(content.web[0]!.sources[0]).toEqual({
      url: 'https://jobs.example.com/be',
      title: 'Backend job',
      retrievedOn: '2026-10-07',
      publishedAt: 'May 2026',
    });
    expect(view.ourPositions[pastId]).toMatchObject({ title: 'Senior Backend Engineer' });
    expect(result.draft?.artifactId).toBe(view.artifactId);

    // Both steps are on the ledger; the search fee is part of the first.
    const { rows } = await admin.query(
      `SELECT "inputTokens", "costUsd"::float8 AS cost FROM "LlmCall" WHERE "aiGenerationId" = $1 ORDER BY "createdAt"`,
      [result.generationId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].cost).toBeCloseTo((3000 * 4 + 800 * 20) / 1e6 + 0.02, 6);
  });

  it('runs with "Our data" only, and says so, when web search is not switched on', async () => {
    const { positionId } = await setup();
    process.env.WEB_SEARCH = 'off';
    resetEnvForTests();
    try {
      searches.length = 0;
      const plan = await run((tx) => planBenchmark(tx, actor, positionId));
      expect(plan.input.webSearchEnabled).toBe(false);
      await runBenchmark(gateway().run as never, actor, positionId, plan, {
        onDelta: () => undefined,
        signal: new AbortController().signal,
      });
      expect(searches).toEqual([]);
      const content = (await run((tx) => getBenchmark(tx, actor, positionId)))
        .content as BenchmarkContent;
      expect(content.webSearch).toBe('off');
      expect(content.web).toEqual([]);
      // Suggestions that rested on web findings are gone; the one on our data stays.
      expect(content.suggestions.map((s) => s.kind)).toEqual(['change_requirement']);
    } finally {
      process.env.WEB_SEARCH = 'on';
      resetEnvForTests();
    }
  });

  describe('suggested changes, one by one', () => {
    it('can only be decided once the benchmark is approved', async () => {
      const { positionId } = await setup();
      const plan = await run((tx) => planBenchmark(tx, actor, positionId));
      const result = await runBenchmark(gateway().run as never, actor, positionId, plan, {
        onDelta: () => undefined,
        signal: new AbortController().signal,
      });
      await expect(
        run((tx) =>
          decideSuggestion(tx, actor, {
            positionId,
            versionId: result.draft!.versionId,
            suggestionId: 'G1',
            decision: 'accepted',
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('accepting writes the change into a new DRAFT of the structured JD and leaves the approved JD alone', async () => {
      const { positionId } = await setup();
      const { versionId } = await runAndApprove(positionId);
      const jd = await run((tx) =>
        findArtifact(tx, { kind: 'structured_jd', subject: { type: 'position', id: positionId } }),
      );
      const approvedBefore = jd!.approvedVersionId;

      const added = await run((tx) =>
        decideSuggestion(tx, actor, {
          positionId,
          versionId,
          suggestionId: 'G1',
          decision: 'accepted',
        }),
      );
      expect(added.appliedVersionId).not.toBeNull();
      const full = await run((tx) => getArtifactWithVersions(tx, jd!.id));
      expect(full.approvedVersionId).toBe(approvedBefore); // still the approved one
      const draft = full.versions.find((v) => v.id === added.appliedVersionId)!;
      expect(draft.status).toBe('draft');
      const content = structuredJdContentSchema.parse(draft.content);
      expect(content.requirements.map((r) => r.text)).toContain('Kubernetes experience');
      expect(content.requirements.find((r) => r.text === 'Kubernetes experience')).toMatchObject({
        section: 'technical_skills',
        category: 'preferred',
      });

      // The next acceptance builds on that draft instead of starting over.
      const changed = await run((tx) =>
        decideSuggestion(tx, actor, {
          positionId,
          versionId,
          suggestionId: 'G3',
          decision: 'accepted',
        }),
      );
      const second = structuredJdContentSchema.parse(
        (await run((tx) => getArtifactWithVersions(tx, jd!.id))).versions.find(
          (v) => v.id === changed.appliedVersionId,
        )!.content,
      );
      expect(second.requirements.map((r) => r.text)).toEqual(
        expect.arrayContaining(['Kubernetes experience', 'Go 1.22+']),
      );
      expect(second.requirements.find((r) => r.id === 'r-go')).toMatchObject({
        text: 'Go 1.22+',
        category: 'must_have',
      });

      const view = await run((tx) => getBenchmark(tx, actor, positionId));
      expect(view.decisions).toEqual({ G1: 'accepted', G3: 'accepted' });
    });

    it('rejecting only records the decision', async () => {
      const { positionId } = await setup();
      const { versionId } = await runAndApprove(positionId);
      const jd = await run((tx) =>
        findArtifact(tx, { kind: 'structured_jd', subject: { type: 'position', id: positionId } }),
      );
      const before = (await run((tx) => getArtifactWithVersions(tx, jd!.id))).versions.length;
      expect(
        await run((tx) =>
          decideSuggestion(tx, actor, {
            positionId,
            versionId,
            suggestionId: 'G2',
            decision: 'rejected',
          }),
        ),
      ).toEqual({ decision: 'rejected', appliedVersionId: null });
      expect((await run((tx) => getArtifactWithVersions(tx, jd!.id))).versions.length).toBe(before);
    });

    it('decides each suggestion once, and refuses one that does not exist', async () => {
      const { positionId } = await setup();
      const { versionId } = await runAndApprove(positionId);
      await run((tx) =>
        decideSuggestion(tx, actor, {
          positionId,
          versionId,
          suggestionId: 'G2',
          decision: 'rejected',
        }),
      );
      await expect(
        run((tx) =>
          decideSuggestion(tx, actor, {
            positionId,
            versionId,
            suggestionId: 'G2',
            decision: 'accepted',
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        run((tx) =>
          decideSuggestion(tx, actor, {
            positionId,
            versionId,
            suggestionId: 'G99',
            decision: 'accepted',
          }),
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('cannot change a requirement that is no longer in the JD, and needs a structured JD to change', async () => {
      const { positionId } = await setup();
      const { versionId } = await runAndApprove(positionId);
      await approveStructuredJd(
        run,
        actor,
        positionId,
        structuredJdContent([{ id: 'other', text: 'Rust', category: 'preferred' }]),
      );
      await expect(
        run((tx) =>
          decideSuggestion(tx, actor, {
            positionId,
            versionId,
            suggestionId: 'G3',
            decision: 'accepted',
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      // Nothing was recorded for the failed one, so it can still be rejected.
      await expect(
        run((tx) =>
          decideSuggestion(tx, actor, {
            positionId,
            versionId,
            suggestionId: 'G3',
            decision: 'rejected',
          }),
        ),
      ).resolves.toMatchObject({ decision: 'rejected' });

      const bare = await run((tx) =>
        createPosition(tx, actor, { clientId, title: 'Backend Engineer', location: 'Seoul' }),
      );
      const plan = await run((tx) => planBenchmark(tx, actor, bare.id));
      expect(plan.input.structuredJd).toBeNull();
    });
  });

  it('is not readable or decidable from another agency', async () => {
    const { positionId } = await setup();
    await runAndApprove(positionId);
    await expect(
      appScope(handle).withAgency(otherAgencyId, (tx) => getBenchmark(tx, otherActor, positionId)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      appScope(handle).withAgency(otherAgencyId, (tx) => planBenchmark(tx, otherActor, positionId)),
    ).rejects.toMatchObject({ status: 404 });
  });
});
