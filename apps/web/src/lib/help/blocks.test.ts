// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { toBlocks } from './blocks';

describe('toBlocks', () => {
  it('keeps catalog order and groups consecutive list items', () => {
    expect(
      toBlocks({ h1: 'A', p1: 'B', li1: 'x', li2: 'y', ol1: '1', ol2: '2', note1: 'N', p2: 'C' }),
    ).toEqual([
      { kind: 'heading', text: 'A' },
      { kind: 'paragraph', text: 'B' },
      { kind: 'bullets', items: ['x', 'y'] },
      { kind: 'steps', items: ['1', '2'] },
      { kind: 'note', text: 'N' },
      { kind: 'paragraph', text: 'C' },
    ]);
  });

  it('starts a new list after other content and ignores unknown keys', () => {
    expect(toBlocks({ li1: 'a', p1: 'b', li2: 'c', zzz1: 'skip' })).toEqual([
      { kind: 'bullets', items: ['a'] },
      { kind: 'paragraph', text: 'b' },
      { kind: 'bullets', items: ['c'] },
    ]);
    expect(toBlocks(undefined)).toEqual([]);
  });
});
