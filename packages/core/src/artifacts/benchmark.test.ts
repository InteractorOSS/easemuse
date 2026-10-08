// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { ARTIFACT_KIND_SPECS } from './kinds';
import { benchmarkContentSchema, isPaidSource } from './benchmark';
import { portfolioFitContentSchema, similarCandidatesContentSchema } from './pool-intelligence';

const GUID = '00000000-0000-4000-8000-000000000001';

describe('paid sources', () => {
  it('recognizes paid providers and their subdomains, and nothing else', () => {
    expect(isPaidSource('https://www.gartner.com/en/x')).toBe(true);
    expect(isPaidSource('https://insights.mercer.com/y')).toBe(true);
    expect(isPaidSource('https://example.com/gartner.com')).toBe(false);
    expect(isPaidSource('https://notgartner.com/')).toBe(false);
    expect(isPaidSource('not a url')).toBe(false);
  });
});

describe('benchmark content', () => {
  const base = {
    generatedOn: '2026-10-07',
    webSearch: 'done',
    webSearchesUsed: 3,
    ourData: [{ id: 'O1', category: 'skill', text: 't', positionIds: [GUID] }],
    web: [
      {
        id: 'W1',
        category: 'compensation',
        text: 'USD 120k to 150k',
        sources: [
          {
            url: 'https://jobs.example.com/a',
            title: 'A',
            retrievedOn: '2026-10-07',
            publishedAt: null,
          },
        ],
      },
    ],
    suggestions: [],
    droppedWebItems: 0,
  };
  it('accepts a report whose web items each have a source with a link and a date', () => {
    expect(benchmarkContentSchema.safeParse(base).success).toBe(true);
  });
  it('refuses a web item without a source, and a source without a date', () => {
    expect(
      benchmarkContentSchema.safeParse({ ...base, web: [{ ...base.web[0], sources: [] }] }).success,
    ).toBe(false);
    const noDate = { ...base.web[0]!.sources[0], retrievedOn: '' };
    expect(
      benchmarkContentSchema.safeParse({ ...base, web: [{ ...base.web[0], sources: [noDate] }] })
        .success,
    ).toBe(false);
  });
  it('is the schema of the kind, so a draft is checked on every write', () => {
    expect(ARTIFACT_KIND_SPECS.benchmark_report.placeholderSchema).toBe(false);
    expect(ARTIFACT_KIND_SPECS.similar_candidates.placeholderSchema).toBe(false);
    expect(ARTIFACT_KIND_SPECS.portfolio_fit.placeholderSchema).toBe(false);
  });
});

describe('pool results', () => {
  it('keeps a reason on one line and caps the list at 25', () => {
    const item = (i: number) => ({
      candidateId: GUID,
      similarity: 0.5,
      reason: `line one\n  line two ${i}`,
      caveat: null,
    });
    const base = { generatedOn: '2026-10-07', basis: 'semantic', notIndexed: 0, poolSize: 30 };
    const ok = similarCandidatesContentSchema.parse({ ...base, items: [item(1)] });
    expect(ok.items[0]!.reason).toBe('line one line two 1');
    expect(
      similarCandidatesContentSchema.safeParse({
        ...base,
        items: Array.from({ length: 26 }, (_, i) => item(i)),
      }).success,
    ).toBe(false);
  });
  it('lists positions that were not assessed, with the reason', () => {
    const parsed = portfolioFitContentSchema.parse({
      generatedOn: '2026-10-07',
      items: [],
      notAssessed: [{ positionId: GUID, why: 'no_success_profile' }],
      truncated: false,
    });
    expect(parsed.notAssessed[0]!.why).toBe('no_success_profile');
  });
});
