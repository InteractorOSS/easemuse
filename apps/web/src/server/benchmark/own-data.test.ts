// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import type { PositionBrief } from '@/server/positions/service';
import { computeOurData, titlesSimilar } from './own-data';

let n = 0;
const past = (over: Partial<PositionBrief>): PositionBrief => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  title: 'Backend Engineer',
  location: 'Seoul',
  department: null,
  workArrangement: null,
  status: 'filled',
  compMin: null,
  compMax: null,
  compCurrency: 'USD',
  requiredExperience: null,
  requiredSkills: [],
  clientId: '00000000-0000-4000-8000-0000000000aa',
  createdAt: new Date('2026-01-01'),
  ...over,
});

describe('titles that count as similar', () => {
  it('ignores level words and needs most role words to match', () => {
    expect(titlesSimilar('Backend Engineer', 'Senior Backend Engineer')).toBe(true);
    expect(titlesSimilar('Head of HR', 'HR Director')).toBe(true);
    expect(titlesSimilar('Backend Engineer', 'Software Engineer')).toBe(false);
    expect(titlesSimilar('Backend Engineer', 'Recruiter')).toBe(false);
  });
});

describe('Our data (counted from the agency’s own positions)', () => {
  const current = { id: '00000000-0000-4000-8000-0000000000ff', title: 'Backend Engineer' };

  it('is empty when no past position is similar', () => {
    expect(computeOurData(current, [past({ title: 'Recruiter' })])).toEqual([]);
  });

  it('links every item to the positions it comes from, with ids O1, O2, ...', () => {
    const a = past({
      requiredSkills: ['Go', 'SQL'],
      workArrangement: 'remote',
      compMin: 100_000,
      compMax: 130_000,
      requiredExperience: '5+ years',
    });
    const b = past({
      title: 'Senior Backend Engineer',
      requiredSkills: ['Go'],
      workArrangement: 'hybrid',
      compMin: 120_000,
      compMax: 160_000,
    });
    const c = past({ title: 'Recruiter', requiredSkills: ['Go'] });
    const items = computeOurData(current, [a, b, c]);
    expect(items.map((i) => i.id)).toEqual(items.map((_, i) => `O${i + 1}`));
    const byCategory = (cat: string) => items.filter((i) => i.category === cat);

    expect(byCategory('title')[0]).toMatchObject({ positionIds: [a.id, b.id] });
    // Go in both similar positions; SQL in one of two is below the bar once there are 3+, but with 2 it counts.
    const go = byCategory('skill').find((i) => i.text.startsWith('Go'));
    expect(go).toMatchObject({
      text: 'Go was a required skill in 2 of 2 similar past positions.',
      positionIds: [a.id, b.id],
    });
    expect(byCategory('compensation')[0]).toMatchObject({
      text: 'USD 100,000 to 160,000 across 2 similar past positions (middle of the ranges: 127,500).',
      positionIds: [a.id, b.id],
    });
    expect(byCategory('location')[0]!.text).toContain('remote 1, hybrid 1');
    expect(byCategory('experience')[0]!.positionIds).toEqual([a.id]);
    // The recruiter title never counts as similar.
    expect(items.flatMap((i) => i.positionIds)).not.toContain(c.id);
  });

  it('keeps currencies apart and skips the position itself', () => {
    const usd = past({ compMin: 100, compMax: 200, compCurrency: 'USD' });
    const krw = past({ compMin: 90_000_000, compMax: 110_000_000, compCurrency: 'KRW' });
    const items = computeOurData(current, [past({ id: current.id }), usd, krw]);
    const comp = items.filter((i) => i.category === 'compensation');
    expect(comp.map((i) => i.text.slice(0, 3)).sort()).toEqual(['KRW', 'USD']);
    expect(items.flatMap((i) => i.positionIds)).not.toContain(current.id);
  });

  it('only names a skill that recurs once there are three similar positions', () => {
    const many = [
      past({ requiredSkills: ['Go', 'Zig'] }),
      past({ requiredSkills: ['Go'] }),
      past({ requiredSkills: ['Go', 'Rust'] }),
    ];
    const skills = computeOurData(current, many).filter((i) => i.category === 'skill');
    expect(skills.map((s) => s.text)).toEqual([
      'Go was a required skill in 3 of 3 similar past positions.',
    ]);
  });
});
