// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

export type DiffLine = { type: 'same' | 'add' | 'remove'; text: string };

/**
 * Line diff by longest common subsequence: what a recruiter changed against the AI original
 * (FR-AI-04). Fine for documents of a few hundred lines; the table is O(n*m) in memory.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ type: 'remove', text: a[i++]! });
    } else {
      out.push({ type: 'add', text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ type: 'remove', text: a[i++]! });
  while (j < b.length) out.push({ type: 'add', text: b[j++]! });
  return out;
}

/** True when the two texts differ at all. */
export function hasChanges(lines: DiffLine[]): boolean {
  return lines.some((line) => line.type !== 'same');
}
