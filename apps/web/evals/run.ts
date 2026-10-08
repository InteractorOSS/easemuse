// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAnthropicClient } from '@/server/ai/anthropic';
import { CostMeter } from './lib/runner';
import { SUITES, type SuiteResult } from './suites';

/**
 * AI evaluation harness (T-QA-03, NFR-AI01): runs prompt modules against the labelled eval data with
 * the real model and reports accuracy and cost. It needs ANTHROPIC_API_KEY and spends money, so it is
 * never part of `pnpm check`; run it when a prompt or model changes.
 *
 *   pnpm eval -- --suite profile-structure --limit 10 --max-cost 2
 *   pnpm eval -- --suite bias --runs 3
 *   pnpm eval -- --suite pool-similar --limit 3
 *   pnpm eval -- --suite benchmark --limit 3     # real web search; not part of `all`
 *   pnpm eval -- --suite all
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set. The evaluation calls the real model.');
    process.exit(2);
  }
  const wanted = arg('suite', 'all');
  // The benchmark searches the web (billed per search, and the Anthropic account must allow it): only on request.
  const names =
    wanted === 'all' ? Object.keys(SUITES).filter((n) => n !== 'benchmark') : wanted.split(',');
  for (const name of names) {
    if (!SUITES[name]) {
      console.error(`Unknown suite "${name}". Choose from: ${Object.keys(SUITES).join(', ')}, all`);
      process.exit(2);
    }
  }
  const model = createAnthropicClient({ apiKey });
  const meter = new CostMeter(Number(arg('max-cost', '5')));
  const results: SuiteResult[] = [];
  for (const name of names) {
    const before = meter.total;
    console.log(`\n== ${name}`);
    const result = await SUITES[name]!({
      model,
      meter,
      limit: Number(arg('limit', '0')),
      runs: Number(arg('runs', name === 'stability' ? '5' : '1')),
      tolerance: Number(arg('tolerance', '5')),
      log: (line) => console.log(`  ${line}`),
    });
    results.push({ ...result, costUsd: Number((meter.total - before).toFixed(4)) });
  }

  console.log('\n== Summary');
  for (const r of results) {
    const metrics = Object.entries(r.metrics)
      .map(([k, v]) => `${k} ${Number.isInteger(v) ? v : v.toFixed(3)}`)
      .join(', ');
    console.log(`${r.suite}: ${r.cases} cases, ${metrics}, $${r.costUsd}`);
    for (const f of r.failures) console.log(`  - ${f}`);
  }
  console.log(`Total cost: $${meter.total.toFixed(4)} over ${meter.calls} calls`);

  const dir = path.resolve(__dirname, 'out');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    file,
    JSON.stringify({ at: new Date().toISOString(), totalCostUsd: meter.total, results }, null, 2),
  );
  console.log(`Report: ${file}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
