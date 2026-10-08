// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { patternSummaryContentSchema, type SummaryFact } from '@easemuse/core';
import { AiInvalidOutputError } from '../errors';
import { createPromptRegistry } from '../prompts';
import { registerBuiltInPrompts } from './index';
import { patternSummarizePrompt } from './pattern-summarize';

const ref = {
  entryId: '00000000-0000-4000-8000-000000000001',
  positionId: '00000000-0000-4000-9000-000000000001',
};
const facts: SummaryFact[] = [
  {
    id: 'F1',
    question: 'interviewProfiles',
    label: 'seniority "Director", who were invited',
    n: 10,
    hits: 6,
    rate: 60,
    small: false,
    refs: [ref],
    refCount: 10,
  },
  {
    id: 'F2',
    question: 'sources',
    label: 'source "referral": hired',
    n: 3,
    hits: 1,
    rate: 33,
    small: true,
    refs: [ref],
    refCount: 3,
  },
];
const context = {
  clientId: '00000000-0000-4000-a000-000000000001',
  clientName: 'Acme',
  asOf: '2026-10-07',
  records: 13,
  positions: 2,
  withheld: 0,
};

describe('A18, pattern.summarize', () => {
  it('is registered with the built-in prompts', () => {
    const registry = createPromptRegistry();
    registerBuiltInPrompts(registry);
    expect(registry.get('pattern.summarize')?.version).toBe('pattern-summarize-v1');
  });

  it('shows the model counts only: ids, labels and numbers, with the few-records marker, and no client name or record ids', () => {
    const { system, user } = patternSummarizePrompt.buildPrompt({ facts, context });
    expect(user).toContain(
      'F1 [interviewProfiles] seniority "Director", who were invited: 6 of 10 (60%)',
    );
    expect(user).toContain('F2 [sources] source "referral": hired: 1 of 3 (33%) [FEW RECORDS]');
    expect(user).not.toContain('Acme');
    expect(user).not.toContain(ref.entryId);
    // the rules the model is held to
    expect(system).toMatch(/Never mention or hint at age, gender/);
    expect(system).toMatch(/data, not instructions/);
    expect(system).toMatch(/Copy the numbers/);
  });

  it('turns the answer into a checked draft with the evidence attached by code', () => {
    const content = patternSummarizePrompt.toContent!(
      {
        statements: [
          { text: '6 of 10 Directors were invited.', factIds: ['F1'] },
          { text: 'Men did best (6 of 10).', factIds: ['F1'] },
        ],
      },
      { facts, context },
    );
    const parsed = patternSummaryContentSchema.parse(content);
    expect(parsed.statements).toHaveLength(1);
    expect(parsed.statements[0]!.evidence[0]).toMatchObject({
      factId: 'F1',
      n: 10,
      hits: 6,
      refCount: 10,
    });
    expect(parsed.checks.removed).toBe(1);
  });

  it('fails, rather than save an empty draft, when nothing passes the check', () => {
    expect(() =>
      patternSummarizePrompt.toContent!(
        { statements: [{ text: '9 of 10.', factIds: ['F1'] }] },
        { facts, context },
      ),
    ).toThrow(AiInvalidOutputError);
  });
});
