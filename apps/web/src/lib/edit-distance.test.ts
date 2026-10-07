// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { editRatio, flattenText } from './edit-distance';

describe('flattenText', () => {
  it('collects every text leaf in order and ignores keys and structure', () => {
    expect(flattenText({ a: 'one', b: [{ c: 'two' }, 3], d: { e: true } })).toBe(
      'one\ntwo\n3\ntrue',
    );
    expect(flattenText(null)).toBe('');
  });
});

describe('editRatio', () => {
  it('is 0 for identical text, ignoring case and spacing', () => {
    expect(editRatio('Led a team', 'led  a TEAM')).toBe(0);
    expect(editRatio('', '')).toBe(0);
  });

  it('is 1 when nothing is shared and counts replaced, added and removed words', () => {
    expect(editRatio('a b c', 'x y z')).toBe(1);
    expect(editRatio('one two three four', 'one two three five')).toBe(0.25); // 1 of 4 words
    expect(editRatio('one two', 'one two three four')).toBe(0.5); // 2 added of 4
    expect(editRatio('one two three four', 'one four')).toBe(0.5); // 2 removed of 4
  });

  it('is symmetric and bounded', () => {
    const a = 'the quick brown fox jumps';
    const b = 'a slow brown dog jumps high';
    expect(editRatio(a, b)).toBe(editRatio(b, a));
    expect(editRatio(a, b)).toBeGreaterThan(0);
    expect(editRatio(a, b)).toBeLessThanOrEqual(1);
  });

  it('handles an empty side', () => {
    expect(editRatio('', 'a b')).toBe(1);
    expect(editRatio('a b', '')).toBe(1);
  });

  it('does not hang on very large texts', () => {
    const big = Array.from({ length: 25_000 }, (_, i) => `w${i}`).join(' ');
    expect(editRatio(big, `${big} extra`)).toBe(1);
    expect(editRatio(big, big)).toBe(0);
  });
});
