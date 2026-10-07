// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { diffLines, hasChanges } from './text-diff';

describe('diffLines', () => {
  it('marks identical text as unchanged', () => {
    const lines = diffLines('a\nb', 'a\nb');
    expect(lines).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ]);
    expect(hasChanges(lines)).toBe(false);
  });

  it('shows added, removed and changed lines in order', () => {
    expect(diffLines('one\ntwo\nthree', 'one\n2\nthree\nfour')).toEqual([
      { type: 'same', text: 'one' },
      { type: 'remove', text: 'two' },
      { type: 'add', text: '2' },
      { type: 'same', text: 'three' },
      { type: 'add', text: 'four' },
    ]);
  });

  it('handles empty sides', () => {
    expect(diffLines('', 'a')).toEqual([{ type: 'add', text: 'a' }]);
    expect(diffLines('a', '')).toEqual([{ type: 'remove', text: 'a' }]);
    expect(diffLines('', '')).toEqual([]);
  });

  it('can be replayed: applying the diff to the original yields the new text', () => {
    const before = 'x\ny\nz\nw';
    const after = 'x\nq\nz\nw\nv';
    const lines = diffLines(before, after);
    expect(
      lines
        .filter((l) => l.type !== 'add')
        .map((l) => l.text)
        .join('\n'),
    ).toBe(before);
    expect(
      lines
        .filter((l) => l.type !== 'remove')
        .map((l) => l.text)
        .join('\n'),
    ).toBe(after);
  });
});
