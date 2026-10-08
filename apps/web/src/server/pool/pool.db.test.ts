// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POOL_MATCH_LIMIT, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import type { ModelClient, ModelRequest } from '@/server/ai/anthropic';
import { AiProviderError } from '@/server/ai/errors';
import { createGateway } from '@/server/ai/gateway';
import { createPromptRegistry } from '@/server/ai/prompts';
import { poolSimilarPrompt } from '@/server/ai/prompts/pool-similar';
import { portfolioCheckPrompt } from '@/server/ai/prompts/portfolio-check';
import { addCandidateToPosition } from '@/server/pipeline/service';
import { createClient } from '@/server/clients/service';
import {
  candidateWithProfile,
  fakeEmbedder,
  indexCandidate,
  positionWithProfile,
  profileOf,
} from '@/test/pool-fixtures';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { getPortfolio, planPortfolioCheck, runPortfolioCheck } from './portfolio';
import { findInPool, getPoolMatches, keywordTerms } from './similar';

describe('keyword fallback terms', () => {
  it('takes the plain words that recur, not filler', () => {
    expect(keywordTerms('Payroll payroll lead for the payroll team and Talent', 3)).toEqual([
      'payroll',
      'lead',
      'talent',
    ]);
  });
});

describe.skipIf(!dbAvailable())('pool intelligence (T-2-17, T-2-18)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let otherAgencyId: string;
  let actor: AgencyActor;
  let otherActor: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  const seen: string[] = [];

  // A stand-in for the model that answers every label it was given.
  const model: ModelClient = {
    async complete<T>(request: ModelRequest<T>) {
      seen.push(`${request.system}\n${request.user}`);
      const refs = [...request.user.matchAll(/ref="([A-Z]\d+)"/g)].map((m) => m[1]!);
      const parsed = request.system.includes('talent pool')
        ? { items: refs.map((ref) => ({ ref, reason: `Reason for ${ref}`, caveat: null })) }
        : {
            items: refs.map((ref, i) => ({
              ref,
              fit: (['strong', 'moderate', 'low'] as const)[i % 3]!,
              reason: `Fit for ${ref}`,
            })),
          };
      return {
        parsed: parsed as never,
        usage: { inputTokens: 200, outputTokens: 100, cachedTokens: 0 },
        stopReason: 'end_turn',
        latencyMs: 5,
      };
    },
  };
  const gateway = () => {
    const prompts = createPromptRegistry();
    prompts.register(poolSimilarPrompt);
    prompts.register(portfolioCheckPrompt);
    return createGateway({ scope: appScope(handle), model, prompts });
  };
  const deps = (embedder = fakeEmbedder()) => ({
    embedder,
    scope: appScope(handle),
    run: gateway().run as never,
    now: () => new Date('2026-10-07T10:00:00Z'),
  });

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(4);
    agencyId = await createAgency(admin, 'Pool A');
    otherAgencyId = await createAgency(admin, 'Pool B');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'admin', true, now())`,
      [agencyId, u1],
    );
    actor = { kind: 'agency', userId: u1, agencyId, role: 'admin' };
    otherActor = { kind: 'agency', userId: u2, agencyId: otherAgencyId, role: 'admin' };
    clientId = (await run((tx) => createClient(tx, actor, { name: 'Pool Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId, otherAgencyId] });
    await admin.end();
    await handle.close();
  });

  describe('Find in my pool', () => {
    it('needs a confirmed success profile (409)', async () => {
      const { positionId } = await positionWithProfile(run, actor, clientId, { profile: false });
      await expect(findInPool(deps(), actor, positionId)).rejects.toMatchObject({ status: 409 });
    });

    it('lists the nearest indexed people with a reason each, adds nobody, and meters the query', async () => {
      const embedder = fakeEmbedder();
      const near = await candidateWithProfile(
        run,
        actor,
        profileOf({ fullName: 'Nora Nearby', coreSkills: ['payroll', 'recruiting'] }),
      );
      const far = await candidateWithProfile(
        run,
        actor,
        profileOf({
          fullName: 'Fred Faraway',
          currentPosition: { title: 'Welder', company: 'Steelworks' },
          careerHistory: [],
          coreSkills: ['welding'],
        }),
      );
      for (const c of [near, far])
        await indexCandidate(run, agencyId, embedder, c.candidateId, c.versionId);
      const { positionId } = await positionWithProfile(run, actor, clientId, {
        summary: 'Head of HR who runs payroll and recruiting',
      });
      const before = await admin.query(
        `SELECT count(*)::int AS n FROM "PipelineEntry" WHERE "agencyId" = $1`,
        [agencyId],
      );

      const out = await findInPool(deps(embedder), actor, positionId);
      expect(out).toMatchObject({ basis: 'semantic' });
      expect(out.result).not.toBeNull();

      const view = await run((tx) => getPoolMatches(tx, actor, positionId));
      expect(view.basis).toBe('semantic');
      expect(view.versionStatus).toBe('draft'); // a suggestion, not an approved record
      const ids = view.items.map((i) => i.candidate.id);
      expect(ids.indexOf(near.candidateId)).toBeLessThan(ids.indexOf(far.candidateId));
      expect(view.items[0]!.reason).toMatch(/^Reason for C\d/);
      expect(
        view.items.every((i) => i.similarity !== null && i.similarity >= 0 && i.similarity <= 1),
      ).toBe(true);

      // Nobody was added to the position.
      const after = await admin.query(
        `SELECT count(*)::int AS n FROM "PipelineEntry" WHERE "agencyId" = $1`,
        [agencyId],
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);

      // The query vector was bought on the recruiter's request and recorded against the position.
      const { rows } = await admin.query(
        `SELECT "requestedById", "positionId", "outputTokens" FROM "LlmCall" WHERE "agencyId" = $1 AND "purpose" = 'embedding.query' ORDER BY "createdAt" DESC LIMIT 1`,
        [agencyId],
      );
      expect(rows[0]).toEqual({ requestedById: actor.userId, positionId, outputTokens: 0 });
      expect(embedder.calls.at(-1)!.inputType).toBe('query');
    });

    it('sends the model cards without names, contact details or ids', async () => {
      const embedder = fakeEmbedder();
      const c = await candidateWithProfile(
        run,
        actor,
        profileOf({
          fullName: 'Ingrid Hidden',
          email: 'ingrid.hidden@example.net',
          phone: '010-7777-6666',
        }),
      );
      await indexCandidate(run, agencyId, embedder, c.candidateId, c.versionId);
      const { positionId } = await positionWithProfile(run, actor, clientId, {
        summary: 'payroll talent acquisition HR Director',
      });
      seen.length = 0;
      await findInPool(deps(embedder), actor, positionId);
      const everything = seen.join('\n') + embedder.sent();
      for (const secret of [
        'Ingrid',
        'Hidden',
        'ingrid.hidden@example.net',
        '7777-6666',
        c.candidateId,
      ])
        expect(everything).not.toContain(secret);
      expect(everything).toContain('<candidate ref="C1">');
    });

    it('lists at most 25, leaves out people already in the position, discarded people and other agencies', async () => {
      const embedder = fakeEmbedder();
      const { positionId } = await positionWithProfile(run, actor, clientId, {
        summary: 'payroll talent acquisition HR Director',
      });
      const made: Awaited<ReturnType<typeof candidateWithProfile>>[] = [];
      for (let i = 0; i < POOL_MATCH_LIMIT + 3; i++)
        made.push(
          await candidateWithProfile(run, actor, profileOf({ fullName: `Pooled Person${i}` })),
        );
      for (const c of made)
        await indexCandidate(run, agencyId, embedder, c.candidateId, c.versionId);
      await run((tx) =>
        addCandidateToPosition(tx, actor, positionId, { candidateId: made[0]!.candidateId }),
      );
      const gone = await candidateWithProfile(run, actor);
      await indexCandidate(run, agencyId, embedder, gone.candidateId, gone.versionId);
      await run((tx) =>
        tx.candidate.update({ where: { id: gone.candidateId }, data: { status: 'discarded' } }),
      );
      // Another agency's candidate with an identical profile.
      const foreign = await appScope(handle).withAgency(otherAgencyId, async (tx) => {
        const candidateId = (
          await tx.candidate.create({
            data: {
              agencyId: otherAgencyId,
              fullName: 'Foreign',
              source: 'linkedin',
              createdById: otherActor.userId,
              status: 'active',
            },
            select: { id: true },
          })
        ).id;
        await tx.$executeRaw`INSERT INTO "ProfileEmbedding" ("id","agencyId","kind","subjectId","versionId","model","embedding") VALUES (gen_random_uuid(), ${otherAgencyId}::uuid, 'candidate_profile', ${candidateId}::uuid, gen_random_uuid(), 'voyage-3-large', ${`[${new Array(
          1024,
        )
          .fill(0)
          .map((_, i) => (i === 0 ? 1 : 0))
          .join(',')}]`}::vector)`;
        return candidateId;
      });

      await findInPool(deps(embedder), actor, positionId);
      const view = await run((tx) => getPoolMatches(tx, actor, positionId));
      const ids = view.items.map((i) => i.candidate.id);
      expect(ids).toHaveLength(POOL_MATCH_LIMIT);
      expect(ids).not.toContain(made[0]!.candidateId);
      expect(ids).not.toContain(gone.candidateId);
      expect(ids).not.toContain(foreign);
      expect(view.alreadyInPosition).toBeGreaterThanOrEqual(1);
    });

    it('still lists a person who must not be contacted, marked so', async () => {
      const embedder = fakeEmbedder();
      const c = await candidateWithProfile(
        run,
        actor,
        profileOf({
          coreSkills: ['zymurgy'],
          currentPosition: { title: 'Zymurgist', company: 'Brewco' },
          careerHistory: [],
        }),
      );
      await indexCandidate(run, agencyId, embedder, c.candidateId, c.versionId);
      await run((tx) =>
        tx.candidate.update({ where: { id: c.candidateId }, data: { doNotContact: true } }),
      );
      const { positionId } = await positionWithProfile(run, actor, clientId, {
        summary: 'zymurgy Zymurgist Brewco',
        criteria: ['zymurgy'],
      });
      await findInPool(deps(embedder), actor, positionId);
      const view = await run((tx) => getPoolMatches(tx, actor, positionId));
      expect(view.items.find((i) => i.candidate.id === c.candidateId)?.candidate.doNotContact).toBe(
        true,
      );
    });

    it('falls back to a keyword search, and says so, when Voyage cannot be reached', async () => {
      const indexed = fakeEmbedder();
      const c = await candidateWithProfile(
        run,
        actor,
        profileOf({
          coreSkills: ['xylophone'],
          currentPosition: { title: 'Xylophonist', company: 'Orchestra' },
          careerHistory: [],
        }),
      );
      await indexCandidate(run, agencyId, indexed, c.candidateId, c.versionId);
      const { positionId } = await positionWithProfile(run, actor, clientId, {
        summary: 'Xylophonist for an orchestra',
        criteria: ['xylophone'],
      });
      const down = fakeEmbedder();
      down.failWith = new AiProviderError('No Voyage API key is configured.', false);
      const out = await findInPool(deps(down), actor, positionId);
      expect(out.basis).toBe('keyword');
      const view = await run((tx) => getPoolMatches(tx, actor, positionId));
      expect(view.basis).toBe('keyword');
      expect(view.items.find((i) => i.candidate.id === c.candidateId)).toMatchObject({
        similarity: null,
      });
    });

    it('does not call the model when nobody matches, and stores nothing', async () => {
      const { positionId } = await positionWithProfile(run, actor, clientId, {
        title: 'Qqqqzzzz',
        location: 'Qqqqland',
        summary: 'qqqqzzzz',
        criteria: ['qqqqzzzz'],
      });
      const down = fakeEmbedder();
      down.failWith = new AiProviderError('provider error 503', true, 503);
      seen.length = 0;
      const out = await findInPool(deps(down), actor, positionId);
      expect(out).toMatchObject({ result: null, found: 0, basis: 'keyword' });
      expect(seen).toEqual([]);
      expect((await run((tx) => getPoolMatches(tx, actor, positionId))).artifactId).toBeNull();
    });

    it('stops with 402 when the month’s budget is used', async () => {
      const { positionId } = await positionWithProfile(run, actor, clientId);
      await admin.query(`UPDATE "Agency" SET "aiMonthlyBudgetUsd" = 0 WHERE id = $1`, [agencyId]);
      try {
        await expect(findInPool(deps(), actor, positionId)).rejects.toMatchObject({ status: 402 });
      } finally {
        await admin.query(`UPDATE "Agency" SET "aiMonthlyBudgetUsd" = NULL WHERE id = $1`, [
          agencyId,
        ]);
      }
    });

    it('is refused for someone who cannot see the position', async () => {
      const { positionId } = await positionWithProfile(run, actor, clientId);
      await expect(findInPool(deps(), otherActor, positionId)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('Check open positions', () => {
    it('rates the candidate against each open position and names what it did not assess', async () => {
      const { candidateId } = await candidateWithProfile(run, actor);
      const p1 = await positionWithProfile(run, actor, clientId, { title: 'HR Director' });
      const p2 = await positionWithProfile(run, actor, clientId, { title: 'HR Business Partner' });
      const noProfile = await positionWithProfile(run, actor, clientId, {
        title: 'Draft role',
        profile: false,
      });
      const already = await positionWithProfile(run, actor, clientId, { title: 'Already in' });
      await run((tx) => addCandidateToPosition(tx, actor, already.positionId, { candidateId }));
      const closed = await positionWithProfile(run, actor, clientId, { title: 'Filled role' });
      await admin.query(`UPDATE "Position" SET status = 'filled' WHERE id = $1`, [
        closed.positionId,
      ]);
      await admin.query(`UPDATE "Position" SET status = 'sourcing' WHERE id = ANY($1)`, [
        [p1.positionId, p2.positionId, noProfile.positionId, already.positionId],
      ]);

      seen.length = 0;
      const plan = await run((tx) => planPortfolioCheck(tx, actor, candidateId));
      await runPortfolioCheck(gateway().run as never, actor, candidateId, plan);
      const view = await run((tx) => getPortfolio(tx, actor, candidateId));

      const titles = view.items.map((i) => i.position.title);
      expect(titles).toEqual(expect.arrayContaining(['HR Director', 'HR Business Partner']));
      expect(titles).not.toContain('Filled role');
      expect(view.items.map((i) => i.fit)).toEqual(
        [...view.items.map((i) => i.fit)].sort(
          (a, b) =>
            ['strong', 'moderate', 'low'].indexOf(a) - ['strong', 'moderate', 'low'].indexOf(b),
        ),
      );
      expect(view.items[0]!.position.clientName).toBe('Pool Client');
      expect(view.notAssessed.map((n) => [n.position.title, n.why])).toEqual(
        expect.arrayContaining([
          ['Draft role', 'no_success_profile'],
          ['Already in', 'already_in_pipeline'],
        ]),
      );
      // The model saw labels and success profiles, never the candidate's identity or position ids.
      const sent = seen.join('\n');
      for (const secret of ['Alex', 'alex.kim@example.com', '1234-5678', p1.positionId])
        expect(sent).not.toContain(secret);
    });

    it('needs a confirmed candidate profile and at least one position to compare with (409)', async () => {
      const bare = await run((tx) =>
        tx.candidate.create({
          data: {
            agencyId,
            fullName: 'No Profile',
            source: 'linkedin',
            createdById: actor.userId,
            status: 'active',
          },
          select: { id: true },
        }),
      );
      await expect(run((tx) => planPortfolioCheck(tx, actor, bare.id))).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        run((tx) => planPortfolioCheck(tx, actor, crypto.randomUUID())),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('does not show one agency’s candidate to another', async () => {
      const { candidateId } = await candidateWithProfile(run, actor);
      await expect(
        appScope(handle).withAgency(otherAgencyId, (tx) =>
          planPortfolioCheck(tx, otherActor, candidateId),
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
