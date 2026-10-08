// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ModelClient } from '@/server/ai/anthropic';
import { patternSummarizePrompt } from '@/server/ai/prompts/pattern-summarize';
import { PATTERN_CASES, gradePatternRun, inputOf } from './patterns';
import { CostMeter, runPrompt } from './runner';

/** The slice of the suite context this suite needs (the full one lives in suites.ts). */
interface Context {
  model: ModelClient;
  meter: CostMeter;
  limit: number;
  log: (line: string) => void;
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * A18 (brief 14, FR-KNW-03, NFR-AI04): the model cites real facts, copies their numbers, hedges what
 * rests on a few records, never names a protected characteristic, and ignores instructions planted in
 * the data. The first and last of these are the model's job; the middle ones are also enforced in
 * code, so a failure here means the model needs a better prompt, not that anything reached a user.
 */
export async function patternSummary(ctx: Context) {
  const cases = ctx.limit > 0 ? PATTERN_CASES.slice(0, ctx.limit) : PATTERN_CASES;
  const failures: string[] = [];
  const faithful: number[] = [];
  const clean: number[] = [];
  const hedged: number[] = [];
  let leaks = 0;
  let obeyed = 0;
  let injectionsKept = 0;
  let protectedKept = 0;
  for (const c of cases) {
    const input = inputOf(c);
    const prompt = patternSummarizePrompt.buildPrompt(input);
    const run = await runPrompt(ctx.model, patternSummarizePrompt, input);
    ctx.meter.add(run);
    const g = gradePatternRun(c, input, prompt, run.output);
    faithful.push(g.statements === 0 ? 0 : 1 - g.unfaithful / g.statements);
    clean.push(g.statements === 0 ? 0 : 1 - g.modelProtected / g.statements);
    if (g.tentative > 0) hedged.push(1 - g.unhedged / g.tentative);
    leaks += g.promptLeaks.length;
    obeyed += g.injectionsFollowed.length;
    injectionsKept += g.injectionsKept.length;
    protectedKept += g.protectedKept;
    ctx.log(
      `${c.name}: ${g.kept}/${g.statements} sentences kept, ${g.unfaithful} unfaithful, ${g.modelProtected} protected`,
    );
    if (g.promptLeaks.length || g.injectionsKept.length || g.protectedKept)
      failures.push(
        `${c.name}: prompt leaks [${g.promptLeaks.join(', ')}], injections kept [${g.injectionsKept.join(', ')}], protected kept ${g.protectedKept}`,
      );
  }
  return {
    suite: 'pattern-summary',
    cases: cases.length,
    costUsd: ctx.meter.total,
    failures,
    metrics: {
      faithfulSentences: mean(faithful),
      noProtectedSentences: mean(clean),
      hedgedWhenFewRecords: hedged.length ? mean(hedged) : 1,
      protectedTextReachingModel: leaks,
      injectionsFollowed: obeyed,
      injectionsKept,
      protectedSentencesKept: protectedKept,
    },
  };
}
