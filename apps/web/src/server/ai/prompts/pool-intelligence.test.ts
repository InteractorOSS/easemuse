// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import type { PortfolioFitContent, SimilarCandidatesContent } from '@easemuse/core';
import { portfolioCheckPrompt, type PortfolioCheckInput } from './portfolio-check';
import { poolSimilarPrompt, type PoolSimilarInput } from './pool-similar';

const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] as const;

const poolInput = (): PoolSimilarInput => ({
  generatedOn: '2026-10-07',
  basis: 'semantic',
  notIndexed: 2,
  poolSize: 40,
  alreadyInPosition: 1,
  position: { title: 'Head of HR', location: 'Seoul' },
  successProfileText: 'Summary: A senior HR leader',
  candidates: [
    {
      ref: 'C1',
      candidateId: ids[0],
      similarity: 0.82,
      text: 'Current position: HR Director at Northwind',
    },
    {
      ref: 'C2',
      candidateId: ids[1],
      similarity: 0.7,
      text: 'Current position: Recruiter at Acme',
    },
    { ref: 'C3', candidateId: ids[2], similarity: 0.61, text: 'Current position: Payroll lead' },
  ],
});

describe('A8 prompt (pool.similar)', () => {
  it('shows the model cards by label, with no id and no similarity figure', () => {
    const { user, system } = poolSimilarPrompt.buildPrompt(poolInput());
    expect(user).toContain('<candidate ref="C1">');
    for (const id of ids) expect(user).not.toContain(id);
    expect(user).not.toContain('0.82');
    expect(system).toMatch(/do not choose or rank anyone/i);
    expect(system).toMatch(/personal characteristics/i);
  });

  it('keeps every candidate, in retrieval order, even one the model skipped', () => {
    const content = poolSimilarPrompt.toContent!(
      {
        items: [
          { ref: 'C2', reason: 'Recruiting background', caveat: null },
          { ref: 'C1', reason: 'Led HR at a similar company', caveat: 'Check the team size' },
          { ref: 'C9', reason: 'A card that was never sent', caveat: null },
        ],
      },
      poolInput(),
    ) as unknown as SimilarCandidatesContent;
    expect(content.items.map((i) => i.candidateId)).toEqual([...ids]);
    expect(content.items[0]).toMatchObject({
      reason: 'Led HR at a similar company',
      similarity: 0.82,
    });
    expect(content.items[2]!.reason).toMatch(/No summary was written/);
    expect(content.notIndexed).toBe(2);
    expect(content.alreadyInPosition).toBe(1);
  });
});

const positions = [
  {
    ref: 'P1',
    positionId: crypto.randomUUID(),
    title: 'HR Director',
    location: 'Seoul',
    profileText: 'Summary: x',
  },
  {
    ref: 'P2',
    positionId: crypto.randomUUID(),
    title: 'HRBP',
    location: 'Busan',
    profileText: 'Summary: y',
  },
  {
    ref: 'P3',
    positionId: crypto.randomUUID(),
    title: 'Recruiter',
    location: 'Seoul',
    profileText: 'Summary: z',
  },
];
const portfolioInput = (): PortfolioCheckInput => ({
  generatedOn: '2026-10-07',
  candidateText: 'Current position: HR Director',
  positions,
  notAssessed: [{ positionId: crypto.randomUUID(), why: 'no_success_profile' }],
  truncated: false,
});

describe('A9 prompt (portfolio.check)', () => {
  it('lists the strong fits first, keeps the low ones, and names what was not assessed', () => {
    const content = portfolioCheckPrompt.toContent!(
      {
        items: [
          { ref: 'P3', fit: 'low', reason: 'No recruiting work' },
          { ref: 'P1', fit: 'strong', reason: 'Same role' },
          { ref: 'P2', fit: 'moderate', reason: 'Adjacent' },
        ],
      },
      portfolioInput(),
    ) as unknown as PortfolioFitContent;
    expect(content.items.map((i) => i.fit)).toEqual(['strong', 'moderate', 'low']);
    expect(content.notAssessed).toHaveLength(1);
  });

  it('does not make up a fit for a position the model skipped', () => {
    const input = portfolioInput();
    const content = portfolioCheckPrompt.toContent!(
      { items: [{ ref: 'P1', fit: 'strong', reason: 'Same role' }] },
      input,
    ) as unknown as PortfolioFitContent;
    expect(content.items).toHaveLength(1);
    expect(content.notAssessed.map((n) => n.why)).toEqual([
      'no_success_profile',
      'no_answer',
      'no_answer',
    ]);
  });

  it('sends position labels, not ids', () => {
    const { user } = portfolioCheckPrompt.buildPrompt(portfolioInput());
    expect(user).toContain('<position ref="P1">');
    for (const p of positions) expect(user).not.toContain(p.positionId);
  });
});
