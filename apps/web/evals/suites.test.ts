// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVEL_BANDS, MATCH_WEIGHT_KEYS, type MatchLevel } from '@easemuse/core';
import type { ModelClient, ModelRequest } from '@/server/ai/anthropic';
import { EVAL_DATA_DIR, allResumeIds, loadResume, type ResumeKey } from './lib/dataset';
import { CRITERION_MAP } from './lib/graders';
import { CostMeter } from './lib/runner';
import { SUITES, type SuiteContext } from './suites';

const haveData = existsSync(path.join(EVAL_DATA_DIR, 'resumes-synthetic', 'manifest.csv'));

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
      if (request.user.includes('Structure the profile')) {
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

  it('match-analyze: levels agree with the key and strong, partial, weak rank in order', async () => {
    const result = await SUITES['match-analyze']!(ctx({ limit: 9 }));
    expect(result.metrics.criterionExact).toBe(1);
    expect(result.metrics.criterionWithinOne).toBe(1);
    expect(result.metrics.rankingOrder).toBe(1);
  });

  it('bias: a name-blind model keeps every pair within the tolerance', async () => {
    const result = await SUITES.bias!(ctx());
    expect(result.cases).toBe(5);
    expect(result.metrics).toMatchObject({ pairsWithinTolerance: 1, maxSpread: 0 });
  });

  it('stability: repeated runs of a steady model do not move', async () => {
    const result = await SUITES.stability!(ctx({ limit: 2, runs: 3 }));
    expect(result.metrics).toMatchObject({ withinTolerance: 1, maxSpread: 0 });
  });

  it('stops when the cost limit is reached', async () => {
    await expect(
      SUITES['profile-structure']!(ctx({ limit: 5, meter: new CostMeter(0.0001) })),
    ).rejects.toThrow(/cost limit/);
  });
});
