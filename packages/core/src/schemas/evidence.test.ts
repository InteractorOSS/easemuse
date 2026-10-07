// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { claimSchema, findUngroundedQuotes, isInferred } from './evidence';

const resume = 'Led a team of 8 engineers at Acme Corp.\nReduced “p95 latency” by 40%.';

describe('claims and evidence (FR-AI-05)', () => {
  it('requires at least one piece of evidence: a citation or an explicit inference', () => {
    expect(claimSchema.safeParse({ text: 'Strong leader', evidence: [] }).success).toBe(false);
    expect(
      claimSchema.safeParse({ text: 'Strong leader', evidence: [{ type: 'inferred' }] }).success,
    ).toBe(true);
    expect(
      claimSchema.safeParse({
        text: 'Strong leader',
        evidence: [{ type: 'quote', source: 'resume', excerpt: 'Led a team of 8' }],
      }).success,
    ).toBe(true);
  });

  it('rejects empty text, unknown sources and empty excerpts', () => {
    expect(claimSchema.safeParse({ text: ' ', evidence: [{ type: 'inferred' }] }).success).toBe(
      false,
    );
    expect(
      claimSchema.safeParse({
        text: 'x',
        evidence: [{ type: 'quote', source: 'rumor', excerpt: 'y' }],
      }).success,
    ).toBe(false);
    expect(
      claimSchema.safeParse({
        text: 'x',
        evidence: [{ type: 'quote', source: 'resume', excerpt: '  ' }],
      }).success,
    ).toBe(false);
  });

  it('tells inferred claims from cited ones', () => {
    expect(isInferred({ evidence: [{ type: 'inferred' }] })).toBe(true);
    expect(
      isInferred({
        evidence: [{ type: 'inferred' }, { type: 'quote', source: 'resume', excerpt: 'a' }],
      }),
    ).toBe(false);
  });

  it('finds quotes that are not in the cited source, ignoring spacing, case and quote style', () => {
    const claim = {
      evidence: [
        {
          type: 'quote' as const,
          source: 'resume' as const,
          excerpt: 'LED A TEAM  of 8 engineers',
        },
        {
          type: 'quote' as const,
          source: 'resume' as const,
          excerpt: 'Reduced "p95 latency" by 40%',
        },
        { type: 'quote' as const, source: 'resume' as const, excerpt: 'Managed a 50-person org' },
        { type: 'quote' as const, source: 'notes' as const, excerpt: 'wants remote' },
        { type: 'inferred' as const },
      ],
    };
    const bad = findUngroundedQuotes(claim, { resume });
    expect(bad.map((q) => q.excerpt)).toEqual(['Managed a 50-person org', 'wants remote']); // second is bad: no notes source given
  });
});
