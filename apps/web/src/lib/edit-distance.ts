// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** All text leaves of a JSON value, in key order, one per line: what a reader would read. */
export function flattenText(value: unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') parts.push(v);
    else if (typeof v === 'number' || typeof v === 'boolean') parts.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(value);
  return parts.join('\n');
}

const words = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean);

/** Largest text compared word by word; beyond this the distance is reported as 1 (fully rewritten). */
const MAX_WORDS = 20_000;

/**
 * How much a person changed an AI draft: word-level Levenshtein distance divided by the longer
 * text's length, from 0 (identical) to 1 (nothing in common). Draft-quality metric (ADR-006, BR-002).
 */
export function editRatio(before: string, after: string): number {
  const a = words(before);
  const b = words(after);
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  if (longest > MAX_WORDS) return a.join(' ') === b.join(' ') ? 0 : 1;

  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length]! / longest;
}
