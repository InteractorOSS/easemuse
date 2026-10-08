// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  DEFAULT_MATCH_WEIGHTS,
  computeOverall,
  criterionScoresOf,
  candidateEmbeddingText,
  identityTokens,
  isPaidSource,
  successProfileEmbeddingText,
  type BenchmarkContent,
  type CandidateProfileContent,
  type MatchAnalysisContent,
  type SimilarCandidatesContent,
} from '@easemuse/core';
import type { ModelClient } from '@/server/ai/anthropic';
import { jdStructurePrompt } from '@/server/ai/prompts/jd-structure';
import { matchAnalyzePrompt, type MatchAnalyzeInput } from '@/server/ai/prompts/match-analyze';
import { marketBenchmarkPrompt, type BenchmarkInput } from '@/server/ai/prompts/market-benchmark';
import { poolSimilarPrompt, type PoolSimilarInput } from '@/server/ai/prompts/pool-similar';
import { profileStructurePrompt } from '@/server/ai/prompts/profile-structure';
import { redactText } from '@/server/ai/redaction';
import { allResumeIds, loadJobDescription, loadResume, type Resume } from './lib/dataset';
import {
  gradeBenchmark,
  gradeMatch,
  gradeProfile,
  gradeReason,
  rankingAccuracy,
  spread,
} from './lib/graders';
import { CostMeter, runPrompt, runResearchedPrompt } from './lib/runner';

export interface SuiteContext {
  model: ModelClient;
  meter: CostMeter;
  /** Resumes or JDs to use; empty means all that apply. */
  limit: number;
  runs: number;
  tolerance: number;
  log: (line: string) => void;
}

export interface SuiteResult {
  suite: string;
  /** Headline numbers, each 0 to 1 unless the name says otherwise. */
  metrics: Record<string, number>;
  /** One line per case that failed, for the report. */
  failures: string[];
  cases: number;
  costUsd: number;
}

type Suite = (ctx: SuiteContext) => Promise<SuiteResult>;

const track = async <T extends { costUsd: number }>(
  ctx: SuiteContext,
  run: Promise<T>,
): Promise<T> => {
  const result = await run;
  ctx.meter.add(result);
  return result;
};
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** A7 on a resume, as production does (the grounded content, not the raw answer). */
async function structure(ctx: SuiteContext, resume: Resume): Promise<CandidateProfileContent> {
  const input = { sourceText: resume.text, source: 'resume' };
  const run = await track(ctx, runPrompt(ctx.model, profileStructurePrompt, input));
  return profileStructurePrompt.toContent!(run.output, input) as unknown as CandidateProfileContent;
}

/** A10 on a structured profile against the success profile built from the JD's must-haves in the key. */
async function analyze(ctx: SuiteContext, resume: Resume, profile: CandidateProfileContent) {
  const jd = loadJobDescription(resume.key.target_jd);
  const {
    fullName: _n,
    email: _e,
    phone: _p,
    potentialMotivation: _m,
    potentialConcerns: _c,
    ...candidate
  } = profile;
  void [_n, _e, _p, _m, _c];
  const input: MatchAnalyzeInput = {
    successProfile: {
      summary: `${jd.title} at ${jd.company}`,
      criteria: resume.key.must_haves.map((m, i) => ({
        id: `c${i + 1}`,
        text: m.requirement,
        category: 'must_have' as const,
        basis: 'jd' as const,
      })),
      expectations: { sixMonths: '', twelveMonths: '' },
      keyChallenges: [],
    },
    candidate,
    position: {
      title: jd.title,
      location: jd.location,
      workArrangement: null,
      compensation: jd.compRange,
    },
  };
  const run = await track(ctx, runPrompt(ctx.model, matchAnalyzePrompt, input));
  const content = matchAnalyzePrompt.toContent!(run.output, input) as MatchAnalysisContent;
  const levels = Object.fromEntries(content.criteria.map((c) => [c.key, c.level]));
  const overall = computeOverall(DEFAULT_MATCH_WEIGHTS, criterionScoresOf(content.criteria), []);
  return { levels, overall };
}

const pick = (ids: string[], limit: number) => (limit > 0 ? ids.slice(0, limit) : ids);

/** NFR-AI02 and NFR-AI03: does A7 read resumes correctly, and does it invent nothing? */
export const profileStructure: Suite = async (ctx) => {
  const ids = pick(allResumeIds(), ctx.limit);
  const grades = [];
  const failures: string[] = [];
  for (const id of ids) {
    const resume = loadResume(id);
    const profile = await structure(ctx, resume);
    const grade = gradeProfile(profile, resume.key, resume.text);
    grades.push(grade);
    ctx.log(
      `${id}: positions ${(grade.positionsFound * 100).toFixed(0)}%, invented ${grade.invented.length}`,
    );
    if (!grade.pass) {
      failures.push(
        `${id}: name ${grade.nameCorrect}, email ${grade.emailCorrect}, positions ${grade.positionsFound.toFixed(2)}, invented [${grade.invented.join(', ')}]`,
      );
    }
  }
  return {
    suite: 'profile-structure',
    cases: ids.length,
    costUsd: ctx.meter.total,
    failures,
    metrics: {
      pass: mean(grades.map((g) => (g.pass ? 1 : 0))),
      nameAccuracy: mean(grades.map((g) => (g.nameCorrect ? 1 : 0))),
      emailAccuracy: mean(grades.map((g) => (g.emailCorrect ? 1 : 0))),
      positionAccuracy: mean(grades.map((g) => g.positionsFound)),
      educationAccuracy: mean(grades.map((g) => g.educationFound)),
      inventedNumberRate: mean(grades.map((g) => (g.invented.length > 0 ? 1 : 0))),
    },
  };
};

/** Brief 5 and ADR-007: do the seven criterion levels agree with the answer key, and do strong, partial and weak resumes rank in order? */
export const matchAnalyze: Suite = async (ctx) => {
  const ids = pick(allResumeIds(), ctx.limit).filter((id) => loadResume(id).key.bias_pair === null);
  const exact: number[] = [];
  const within: number[] = [];
  const scores = new Map<string, Partial<Record<'strong' | 'partial' | 'weak', number>>>();
  for (const id of ids) {
    const resume = loadResume(id);
    const { levels, overall } = await analyze(ctx, resume, await structure(ctx, resume));
    const grade = gradeMatch(levels as never, resume.key);
    exact.push(grade.exact / grade.total);
    within.push(grade.withinOne / grade.total);
    const row = scores.get(resume.key.target_jd) ?? {};
    row[resume.key.intended_fit] = overall;
    scores.set(resume.key.target_jd, row);
    ctx.log(
      `${id} (${resume.key.intended_fit}): overall ${overall}, exact ${grade.exact}/${grade.total}`,
    );
  }
  return {
    suite: 'match-analyze',
    cases: ids.length,
    costUsd: ctx.meter.total,
    failures: [...scores].flatMap(([jd, s]) =>
      s.strong !== undefined &&
      s.partial !== undefined &&
      s.weak !== undefined &&
      !(s.strong > s.partial && s.partial > s.weak)
        ? [`${jd}: strong ${s.strong}, partial ${s.partial}, weak ${s.weak} are not in order`]
        : [],
    ),
    metrics: {
      criterionExact: mean(exact),
      criterionWithinOne: mean(within),
      rankingOrder: rankingAccuracy(scores),
    },
  };
};

/** NFR-AI04: two resumes that differ only in the name must score the same, within the tolerance. */
export const bias: Suite = async (ctx) => {
  const byPair = new Map<string, string[]>();
  for (const id of allResumeIds()) {
    const pair = loadResume(id).key.bias_pair;
    if (pair) byPair.set(pair, [...(byPair.get(pair) ?? []), id]);
  }
  const pairs = pick([...byPair.keys()], ctx.limit);
  const failures: string[] = [];
  const spreads: number[] = [];
  for (const pair of pairs) {
    const overall: number[] = [];
    for (const id of byPair.get(pair)!) {
      const resume = loadResume(id);
      for (let run = 0; run < ctx.runs; run++) {
        overall.push((await analyze(ctx, resume, await structure(ctx, resume))).overall);
      }
    }
    const gap = spread(overall);
    spreads.push(gap);
    ctx.log(`${pair}: scores ${overall.join(', ')} (spread ${gap})`);
    if (gap > ctx.tolerance)
      failures.push(`${pair}: spread ${gap} is above ${ctx.tolerance} (${overall.join(', ')})`);
  }
  return {
    suite: 'bias',
    cases: pairs.length,
    costUsd: ctx.meter.total,
    failures,
    metrics: {
      pairsWithinTolerance: mean(spreads.map((s) => (s <= ctx.tolerance ? 1 : 0))),
      maxSpread: Math.max(0, ...spreads),
    },
  };
};

/** TR-010: the same resume analysed several times must keep its score within the tolerance. */
export const stability: Suite = async (ctx) => {
  const ids = pick(allResumeIds(), ctx.limit).filter((id) => loadResume(id).key.bias_pair === null);
  const failures: string[] = [];
  const spreads: number[] = [];
  for (const id of ids) {
    const resume = loadResume(id);
    const profile = await structure(ctx, resume);
    const overall: number[] = [];
    for (let run = 0; run < ctx.runs; run++)
      overall.push((await analyze(ctx, resume, profile)).overall);
    const gap = spread(overall);
    spreads.push(gap);
    ctx.log(`${id}: scores ${overall.join(', ')} (spread ${gap})`);
    if (gap > ctx.tolerance)
      failures.push(`${id}: spread ${gap} is above ${ctx.tolerance} (${overall.join(', ')})`);
  }
  return {
    suite: 'stability',
    cases: ids.length,
    costUsd: ctx.meter.total,
    failures,
    metrics: {
      withinTolerance: mean(spreads.map((s) => (s <= ctx.tolerance ? 1 : 0))),
      maxSpread: Math.max(0, ...spreads),
    },
  };
};

/** A1 on the real JDs: sections found, requirements listed, and pay recognised when the JD states it. */
export const jdStructure: Suite = async (ctx) => {
  const ids = pick(
    Array.from({ length: 32 }, (_, i) => `jd-${String(i + 1).padStart(2, '0')}`),
    ctx.limit,
  );
  const failures: string[] = [];
  const checks: number[] = [];
  for (const id of ids) {
    let jd;
    try {
      jd = loadJobDescription(id);
    } catch {
      continue;
    }
    const input = { jdText: jd.text, position: { title: jd.title, location: jd.location } };
    const run = await track(ctx, runPrompt(ctx.model, jdStructurePrompt, input));
    const sections = Object.values(run.output.sections);
    const found = sections.filter((s) => s.status === 'found').length;
    const compensation = run.output.sections.compensation.status === 'found';
    const ok =
      found >= 6 && run.output.requirements.length >= 5 && compensation === jd.hasCompRange;
    checks.push(ok ? 1 : 0);
    ctx.log(
      `${id}: ${found} sections, ${run.output.requirements.length} requirements, pay ${compensation}`,
    );
    if (!ok) {
      failures.push(
        `${id}: ${found} sections found, ${run.output.requirements.length} requirements, compensation found ${compensation} (JD states pay: ${jd.hasCompRange})`,
      );
    }
  }
  return {
    suite: 'jd-structure',
    cases: checks.length,
    costUsd: ctx.meter.total,
    failures,
    metrics: { pass: mean(checks) },
  };
};

/**
 * A8 (US-205, FR-AI-09): the one-line reasons for "Find in my pool". Resumes that were written for
 * the same JD form a small pool; the cards are built exactly as in production (approved profile,
 * no name or contact details). A reason must be short, grounded in the card, say "the candidate"
 * and never carry an identity.
 */
export const poolSimilar: Suite = async (ctx) => {
  const byJd = new Map<string, string[]>();
  for (const id of allResumeIds()) {
    const jd = loadResume(id).key.target_jd;
    byJd.set(jd, [...(byJd.get(jd) ?? []), id]);
  }
  const jds = pick([...byJd.keys()], ctx.limit);
  const grades: ReturnType<typeof gradeReason>[] = [];
  const failures: string[] = [];
  let cards = 0;
  let answered = 0;
  for (const jdId of jds) {
    const jd = loadJobDescription(jdId);
    const resumes = byJd
      .get(jdId)!
      .slice(0, 6)
      .map((id) => loadResume(id));
    const people: { ref: string; text: string; names: string[] }[] = [];
    for (const [i, resume] of resumes.entries()) {
      const profile = await structure(ctx, resume);
      people.push({
        ref: `C${i + 1}`,
        text: redactText(candidateEmbeddingText(profile)).value.slice(0, 1_800),
        names: identityTokens(profile.fullName),
      });
    }
    const successProfileText = successProfileEmbeddingText(
      {
        summary: `${jd.title} at ${jd.company}`,
        criteria: resumes[0]!.key.must_haves.map((m, i) => ({
          id: `c${i + 1}`,
          text: m.requirement,
          category: 'must_have' as const,
          basis: 'jd' as const,
        })),
        expectations: { sixMonths: '', twelveMonths: '' },
        keyChallenges: [],
      },
      { title: jd.title, location: jd.location },
    );
    const input: PoolSimilarInput = {
      generatedOn: new Date().toISOString().slice(0, 10),
      basis: 'semantic',
      notIndexed: 0,
      poolSize: people.length,
      alreadyInPosition: 0,
      position: { title: jd.title, location: jd.location },
      successProfileText,
      candidates: people.map((p, i) => ({
        ref: p.ref,
        candidateId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        similarity: null,
        text: p.text,
      })),
    };
    const run = await track(ctx, runPrompt(ctx.model, poolSimilarPrompt, input));
    const content = poolSimilarPrompt.toContent!(run.output, input) as SimilarCandidatesContent;
    for (const [i, person] of people.entries()) {
      cards++;
      const written = run.output.items.filter((it) => it.ref === person.ref);
      if (written.length === 1) answered++;
      const reason = content.items[i]!.reason;
      const grade = gradeReason(reason, {
        source: `${person.text}\n${successProfileText}`,
        names: person.names,
      });
      grades.push(grade);
      if (!grade.pass || written.length !== 1) {
        failures.push(
          `${jdId} ${person.ref}: answered ${written.length}x, ${grade.words} words, identity ${grade.leaksIdentity}, gendered [${grade.gendered.join(', ')}], invented [${grade.invented.join(', ')}]`,
        );
      }
    }
    ctx.log(
      `${jdId}: ${people.length} cards, ${grades.filter((g) => !g.pass).length} reasons failed so far`,
    );
  }
  return {
    suite: 'pool-similar',
    cases: cards,
    costUsd: ctx.meter.total,
    failures,
    metrics: {
      answeredOnce: cards === 0 ? 0 : answered / cards,
      reasonPass: mean(grades.map((g) => (g.pass ? 1 : 0))),
      withinLength: mean(grades.map((g) => (g.withinLength ? 1 : 0))),
      noIdentity: mean(grades.map((g) => (g.leaksIdentity ? 0 : 1))),
      noGenderedWords: mean(grades.map((g) => (g.gendered.length === 0 ? 1 : 0))),
      noInventedNumbers: mean(grades.map((g) => (g.invented.length === 0 ? 1 : 0))),
    },
  };
};

/**
 * A3 (US-108, Q-05): the benchmark's web step with real search. Items must rest on pages the search
 * actually cited, carry a link and a date, avoid paid sources, and state only numbers the cited
 * material contains. `rawCitedRate` is the model's own discipline before the code drops anything.
 */
export const benchmark: Suite = async (ctx) => {
  const ids = pick(
    Array.from({ length: 32 }, (_, i) => `jd-${String(i + 1).padStart(2, '0')}`),
    ctx.limit || 3,
  );
  const grades: ReturnType<typeof gradeBenchmark>[] = [];
  const failures: string[] = [];
  for (const id of ids) {
    let jd;
    try {
      jd = loadJobDescription(id);
    } catch {
      continue;
    }
    const input: BenchmarkInput = {
      generatedOn: new Date().toISOString().slice(0, 10),
      webSearchEnabled: true,
      position: {
        title: jd.title,
        location: jd.location,
        department: null,
        workArrangement: null,
        compensation: jd.compRange,
        requiredExperience: null,
        requiredSkills: [],
      },
      structuredJd: null,
      ourData: [],
    };
    const run = await track(ctx, runResearchedPrompt(ctx.model, marketBenchmarkPrompt, input));
    const content = marketBenchmarkPrompt.toContent!(
      run.output,
      input,
      run.research,
    ) as BenchmarkContent;
    const grade = gradeBenchmark({
      raw: run.output,
      research: run.research ?? { findings: '', sources: [] },
      content,
      isPaid: isPaidSource,
    });
    grades.push(grade);
    ctx.log(
      `${id}: ${run.research?.searches ?? 0} searches, ${grade.keptItems} items kept, cited ${(grade.rawCitedRate * 100).toFixed(0)}%`,
    );
    if (!grade.allLinked || grade.anyPaid || grade.numbersSupported < 1 || grade.keptItems === 0) {
      failures.push(
        `${id}: kept ${grade.keptItems}, linked ${grade.allLinked}, paid ${grade.anyPaid}, numbers supported ${grade.numbersSupported.toFixed(2)}`,
      );
    }
  }
  return {
    suite: 'benchmark',
    cases: grades.length,
    costUsd: ctx.meter.total,
    failures,
    metrics: {
      rawCitedRate: mean(grades.map((g) => g.rawCitedRate)),
      allLinked: mean(grades.map((g) => (g.allLinked ? 1 : 0))),
      paidSourceRate: mean(grades.map((g) => (g.anyPaid ? 1 : 0))),
      numbersSupported: mean(grades.map((g) => g.numbersSupported)),
      itemsKept: mean(grades.map((g) => g.keptItems)),
      suggestionsKeptRate: mean(grades.map((g) => g.suggestionsKeptRate)),
    },
  };
};

export const SUITES: Record<string, Suite> = {
  'jd-structure': jdStructure,
  'profile-structure': profileStructure,
  'match-analyze': matchAnalyze,
  bias,
  stability,
  'pool-similar': poolSimilar,
  benchmark,
};
