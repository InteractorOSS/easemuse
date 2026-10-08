// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVEL_BANDS, MATCH_WEIGHT_KEYS, type MatchLevel } from '@easemuse/core';
import type { ModelClient, ModelRequest, SearchResponse } from '@/server/ai/anthropic';
import { EVAL_DATA_DIR, allResumeIds, loadResume, type ResumeKey } from './lib/dataset';
import { CRITERION_MAP } from './lib/graders';
import { CostMeter } from './lib/runner';
import { SUITES, type SuiteContext } from './suites';

const haveData = existsSync(path.join(EVAL_DATA_DIR, 'resumes-synthetic', 'manifest.csv'));
// The job description texts are third-party and never committed (eval-data/job-descriptions/README.md),
// so CI has only the synthetic resumes; the suites that read a JD run where the texts are present.
const haveJds = existsSync(path.join(EVAL_DATA_DIR, 'job-descriptions', 'jd-01.md'));

/**
 * A model stand-in that answers from the answer keys, so the harness plumbing (prompt building,
 * schema checks, grading, cost metering, ranking) is tested without spending anything. A perfect
 * model must score perfectly; anything else points at the harness.
 */
function keyedModel(): ModelClient {
  const byEmail = new Map<string, ResumeKey>(
    allResumeIds().map((id) => {
      const { key } = loadResume(id);
      return [key.facts.email.toLowerCase(), key];
    }),
  );
  let current: ResumeKey | null = null;
  const usage = { inputTokens: 1_000, outputTokens: 500, cachedTokens: 0 };
  return {
    async complete<T>(request: ModelRequest<T>) {
      let parsed: unknown;
      if (request.user.includes('Write one entry for each of the')) {
        // A8: a short, grounded, gender-neutral line for every card.
        parsed = {
          items: [...request.user.matchAll(/<candidate ref="(C\d+)">/g)].map((m) => ({
            ref: m[1],
            reason: 'Has led HR work in a similar role.',
            caveat: null,
          })),
        };
      } else if (request.user.includes('Return the web findings and the suggestions.')) {
        // A3 step 2: two findings that carry labels of cited pages, one that carries none.
        parsed = {
          web: [
            {
              ref: 'W1',
              category: 'title',
              text: 'Director of HR is the usual title.',
              sourceIds: ['S1'],
            },
            {
              ref: 'W2',
              category: 'compensation',
              text: 'Pay of 120k is typical.',
              sourceIds: ['S1', 'S2'],
            },
            { ref: 'W3', category: 'skill', text: 'Everyone wants Python.', sourceIds: [] },
          ],
          suggestions: [
            {
              kind: 'update_section',
              section: 'compensation',
              text: '120k',
              category: null,
              requirementId: null,
              rationale: 'Typical pay',
              basedOn: ['W2'],
            },
          ],
        };
      } else if (request.user.includes('Structure the profile')) {
        const email = /[\w.+-]+@[\w.-]+/.exec(request.user)![0].toLowerCase();
        current = byEmail.get(email)!;
        const f = current.facts;
        parsed = {
          fullName: f.full_name,
          email: f.email,
          phone: null,
          currentPosition: { title: f.positions[0]!.title, company: f.positions[0]!.employer },
          careerHistory: f.positions.map((p) => ({
            company: p.employer,
            title: p.title,
            start: p.start,
            end: p.end === 'present' ? null : p.end,
            current: p.end === 'present',
            summary: '',
          })),
          education: f.education.map((e) => ({
            school: e.school,
            degree: e.degree,
            year: String(e.year),
          })),
          coreSkills: [],
          industryExperience: [],
          technicalSkills: [],
          leadershipExperience: null,
          teamSize: null,
          careerProgression: null,
          majorAchievements: [],
          location: null,
          workAuthorization: f.work_authorization,
          compensationExpectation: f.compensation_expectation,
          potentialMotivation: null,
          potentialConcerns: [],
        };
      } else {
        const key = current!;
        parsed = {
          criteria: MATCH_WEIGHT_KEYS.map((k) => {
            const keyName = Object.entries(CRITERION_MAP).find(([, v]) => v === k)![0];
            const level = key.criteria[keyName]!.level as MatchLevel;
            const band = LEVEL_BANDS[level];
            return {
              key: k,
              level,
              score: Math.round((band.min + band.max) / 2),
              summary: 'ok',
              evidence: [],
              toConfirm: [],
            };
          }),
          requirements: key.must_haves.map((m, i) => ({
            criterionId: `c${i + 1}`,
            status: m.status,
            evidence: [],
          })),
        };
      }
      return { parsed: request.schema.parse(parsed), usage, stopReason: 'end_turn', latencyMs: 1 };
    },
    async search(): Promise<SearchResponse> {
      return {
        findings: 'Director of HR is the usual title. [S1] Pay of 120k is typical. [S2]',
        sources: [
          {
            id: 'S1',
            url: 'https://jobs.example.com/hr',
            title: 'HR job',
            pageAge: null,
            citedTexts: ['Director of HR'],
          },
          {
            id: 'S2',
            url: 'https://careers.example.org/hr',
            title: 'Another',
            pageAge: 'May 2026',
            citedTexts: ['120k'],
          },
        ],
        searches: 3,
        usage: { inputTokens: 2_000, outputTokens: 500, cachedTokens: 0, webSearchRequests: 3 },
        latencyMs: 1,
      };
    },
  };
}

const ctx = (over: Partial<SuiteContext> = {}): SuiteContext => ({
  model: keyedModel(),
  meter: new CostMeter(100),
  limit: 0,
  runs: 1,
  tolerance: 5,
  log: () => undefined,
  ...over,
});

describe.skipIf(!haveData)('eval suites against a model that knows the answers', () => {
  it('profile-structure: a perfect reader scores 1 everywhere', async () => {
    const result = await SUITES['profile-structure']!(ctx({ limit: 12 }));
    expect(result.failures).toEqual([]);
    expect(result.metrics).toMatchObject({
      pass: 1,
      nameAccuracy: 1,
      emailAccuracy: 1,
      positionAccuracy: 1,
      educationAccuracy: 1,
      inventedNumberRate: 0,
    });
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it.skipIf(!haveJds)(
    'match-analyze: levels agree with the key and strong, partial, weak rank in order',
    async () => {
      const result = await SUITES['match-analyze']!(ctx({ limit: 9 }));
      expect(result.metrics.criterionExact).toBe(1);
      expect(result.metrics.criterionWithinOne).toBe(1);
      expect(result.metrics.rankingOrder).toBe(1);
    },
  );

  it.skipIf(!haveJds)(
    'bias: a name-blind model keeps every pair within the tolerance',
    async () => {
      const result = await SUITES.bias!(ctx());
      expect(result.cases).toBe(5);
      expect(result.metrics).toMatchObject({ pairsWithinTolerance: 1, maxSpread: 0 });
    },
  );

  it.skipIf(!haveJds)('stability: repeated runs of a steady model do not move', async () => {
    const result = await SUITES.stability!(ctx({ limit: 2, runs: 3 }));
    expect(result.metrics).toMatchObject({ withinTolerance: 1, maxSpread: 0 });
  });

  it.skipIf(!haveJds)(
    'pool-similar: a model that follows the prompt answers every card with a clean line',
    async () => {
      const result = await SUITES['pool-similar']!(ctx({ limit: 2 }));
      expect(result.failures).toEqual([]);
      expect(result.metrics).toMatchObject({
        answeredOnce: 1,
        reasonPass: 1,
        noIdentity: 1,
        noGenderedWords: 1,
        noInventedNumbers: 1,
      });
      expect(result.cases).toBeGreaterThan(2);
    },
  );

  it.skipIf(!haveJds)(
    'benchmark: keeps the cited findings, drops the one without a page, and counts the search fee',
    async () => {
      const result = await SUITES.benchmark!(ctx({ limit: 2 }));
      expect(result.cases).toBe(2);
      expect(result.failures).toEqual([]);
      expect(result.metrics).toMatchObject({
        allLinked: 1,
        paidSourceRate: 0,
        numbersSupported: 1,
        itemsKept: 2,
      });
      // Two thirds of the model's findings named a cited page.
      expect(result.metrics.rawCitedRate).toBeCloseTo(2 / 3, 5);
      // The 3 searches cost $0.03 on top of the tokens, per case.
      expect(result.costUsd).toBeGreaterThanOrEqual(0.06);
    },
  );

  it('stops when the cost limit is reached', async () => {
    await expect(
      SUITES['profile-structure']!(ctx({ limit: 5, meter: new CostMeter(0.0001) })),
    ).rejects.toThrow(/cost limit/);
  });
});
