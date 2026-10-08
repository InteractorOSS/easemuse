// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  PAID_SOURCE_DOMAINS,
  benchmarkContentSchema,
  type BenchmarkContent,
  type BenchmarkModelOutput,
} from '@easemuse/core';
import type { SearchResponse } from '../anthropic';
import { marketBenchmarkPrompt, type BenchmarkInput } from './market-benchmark';

const positionA = crypto.randomUUID();
const input = (over: Partial<BenchmarkInput> = {}): BenchmarkInput => ({
  generatedOn: '2026-10-07',
  webSearchEnabled: true,
  position: {
    title: 'Backend Engineer',
    location: 'Seoul',
    department: null,
    workArrangement: null,
    compensation: null,
    requiredExperience: null,
    requiredSkills: ['Go'],
  },
  structuredJd: {
    sections: [{ section: 'technical_skills', summary: 'Go' }],
    requirements: [{ id: 'r1', section: 'technical_skills', text: 'Go', category: 'must_have' }],
  },
  ourData: [
    { id: 'O1', category: 'skill', text: 'Go was required in 3 of 3.', positionIds: [positionA] },
  ],
  ...over,
});

const research = (over: Partial<SearchResponse> = {}): SearchResponse => ({
  findings: 'Salary is 120k. [S1] Kubernetes is common. [S2]',
  sources: [
    {
      id: 'S1',
      url: 'https://jobs.example.com/a',
      title: 'A job',
      pageAge: 'April 2026',
      citedTexts: ['120k'],
    },
    { id: 'S2', url: 'https://www.payscale.com/b', title: 'Paid', pageAge: null, citedTexts: [] },
  ],
  searches: 3,
  usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, webSearchRequests: 3 },
  latencyMs: 5,
  ...over,
});

const output = (over: Partial<BenchmarkModelOutput> = {}): BenchmarkModelOutput => ({
  web: [
    { ref: 'W1', category: 'compensation', text: 'Salary is 120k.', sourceIds: ['S1'] },
    { ref: 'W2', category: 'skill', text: 'Kubernetes is common.', sourceIds: ['S2'] },
    { ref: 'W3', category: 'skill', text: 'Made up from memory.', sourceIds: [] },
    { ref: 'W4', category: 'skill', text: 'Wrong label.', sourceIds: ['S9'] },
  ],
  suggestions: [],
  ...over,
});

const build = (o = output(), i = input(), r: SearchResponse | null = research()) =>
  marketBenchmarkPrompt.toContent!(o, i, r) as unknown as BenchmarkContent;

describe('A3 prompt (market.benchmark)', () => {
  it('searches only when web search is on, with the cap and the paid sources blocked', () => {
    expect(
      marketBenchmarkPrompt.research!.buildRequest(input({ webSearchEnabled: false })),
    ).toBeNull();
    const request = marketBenchmarkPrompt.research!.buildRequest(input())!;
    expect(request.maxUses).toBe(5);
    expect(request.blockedDomains).toEqual([...PAID_SOURCE_DOMAINS]);
    expect(request.system).toMatch(/PUBLIC pages only/);
    expect(request.system).toMatch(/Never use paid/);
  });

  it('gives the structuring step the findings with their labels and the sources', () => {
    const { user } = marketBenchmarkPrompt.buildPrompt(input(), research());
    expect(user).toContain('Salary is 120k. [S1]');
    expect(user).toContain('S1: A job');
    expect(user).toContain('O1 [skill] Go was required in 3 of 3.');
    expect(user).toContain('id=r1');
  });

  it('tells the model to return no web findings when no research was done', () => {
    const { user } = marketBenchmarkPrompt.buildPrompt(input({ webSearchEnabled: false }), null);
    expect(user).toContain('return an empty "web" list');
  });

  it('keeps a web finding only with a cited page, and drops the rest (counted)', () => {
    const content = build();
    expect(content.web).toHaveLength(1);
    expect(content.web[0]).toMatchObject({
      id: 'W1',
      text: 'Salary is 120k.',
      sources: [
        {
          url: 'https://jobs.example.com/a',
          title: 'A job',
          retrievedOn: '2026-10-07',
          publishedAt: 'April 2026',
        },
      ],
    });
    // W2 rests on a paid source, W3 has no label, W4 an invented label.
    expect(content.droppedWebItems).toBe(3);
    expect(content.webSearch).toBe('done');
    expect(content.webSearchesUsed).toBe(3);
    expect(benchmarkContentSchema.safeParse(content).success).toBe(true);
  });

  it('takes links and dates from the search, never from the model', () => {
    const content = build(
      output({ web: [{ ref: 'W1', category: 'title', text: 'Title X', sourceIds: ['S1'] }] }),
    );
    expect(content.web[0]!.sources[0]!.url).toBe('https://jobs.example.com/a');
  });

  it('has no web items when search was off, even if the model wrote some', () => {
    const content = build(output(), input({ webSearchEnabled: false }), null);
    expect(content.web).toEqual([]);
    expect(content.webSearch).toBe('off');
    expect(content.droppedWebItems).toBe(4);
    expect(content.ourData).toHaveLength(1);
  });

  it('says no results when search ran but nothing could be cited', () => {
    const content = build(
      output({ web: [{ ref: 'W1', category: 'skill', text: 'x', sourceIds: [] }] }),
    );
    expect(content.webSearch).toBe('no_results');
  });

  it('keeps a suggestion only when it rests on a kept finding or our data, and fits the JD', () => {
    const content = build(
      output({
        suggestions: [
          {
            kind: 'add_requirement',
            section: 'technical_skills',
            text: 'Kubernetes',
            category: 'preferred',
            requirementId: null,
            rationale: 'r',
            basedOn: ['W1', 'W2'],
          },
          {
            kind: 'add_requirement',
            section: 'technical_skills',
            text: 'Rust',
            category: 'preferred',
            requirementId: null,
            rationale: 'r',
            basedOn: ['W2'],
          },
          {
            kind: 'change_requirement',
            section: 'technical_skills',
            text: 'Go 1.22',
            category: 'must_have',
            requirementId: 'r1',
            rationale: 'r',
            basedOn: ['O1'],
          },
          {
            kind: 'change_requirement',
            section: 'technical_skills',
            text: 'Ghost',
            category: 'must_have',
            requirementId: 'nope',
            rationale: 'r',
            basedOn: ['O1'],
          },
          {
            kind: 'update_section',
            section: 'compensation',
            text: 'USD 120k to 150k',
            category: 'must_have',
            requirementId: 'r1',
            rationale: 'r',
            basedOn: ['W1'],
          },
        ],
      }),
    );
    expect(content.suggestions.map((s) => [s.id, s.kind, s.basedOn])).toEqual([
      ['G1', 'add_requirement', ['W1']],
      ['G2', 'change_requirement', ['O1']],
      ['G3', 'update_section', ['W1']],
    ]);
    // An update has no category and no requirement.
    expect(content.suggestions[2]).toMatchObject({ category: null, requirementId: null });
  });

  it('cannot change a requirement when there is no structured JD', () => {
    const content = build(
      output({
        suggestions: [
          {
            kind: 'change_requirement',
            section: 'technical_skills',
            text: 'x',
            category: 'must_have',
            requirementId: 'r1',
            rationale: 'r',
            basedOn: ['O1'],
          },
        ],
      }),
      input({ structuredJd: null }),
    );
    expect(content.suggestions).toEqual([]);
  });
});
