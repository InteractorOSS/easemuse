// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { BenchmarkCategory, BenchmarkOurItem } from '@easemuse/core';
import type { PositionBrief } from '@/server/positions/service';

/**
 * "Our data" for a benchmark (Q-21): what the agency's own earlier positions with similar titles
 * said. It is counted from the records, not written by a model, and every item links to the
 * positions it comes from. Nothing here goes to the web.
 */

/** Words that say how senior a role is, not what it is: they do not decide whether two titles match. */
const LEVEL_WORDS = new Set([
  'senior',
  'sr',
  'junior',
  'jr',
  'lead',
  'principal',
  'staff',
  'head',
  'chief',
  'associate',
  'assistant',
  'intern',
  'and',
  'of',
  'the',
  'for',
  'ii',
  'iii',
  'i',
  'manager',
]);

export function titleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter((t) => t.length > 0 && !LEVEL_WORDS.has(t));
  return new Set(tokens.length > 0 ? tokens : title.toLowerCase().split(/\s+/).filter(Boolean));
}

/** Two titles match when most of the shorter one's role words appear in the other. */
export function titlesSimilar(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared >= 1 && shared / Math.min(ta.size, tb.size) >= 0.6;
}

const MAX_SIMILAR = 20;

const median = (values: number[]): number => {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const money = (value: number) => Math.round(value).toLocaleString('en-US');

export function computeOurData(
  current: Pick<PositionBrief, 'id' | 'title'>,
  others: PositionBrief[],
): BenchmarkOurItem[] {
  const similar = others
    .filter((p) => p.id !== current.id && titlesSimilar(current.title, p.title))
    .slice(0, MAX_SIMILAR);
  if (similar.length === 0) return [];
  const items: Omit<BenchmarkOurItem, 'id'>[] = [];
  const add = (category: BenchmarkCategory, text: string, from: PositionBrief[]) =>
    items.push({ category, text, positionIds: from.slice(0, 50).map((p) => p.id) });
  const n = similar.length;

  // Titles used.
  const byTitle = new Map<string, PositionBrief[]>();
  for (const p of similar) {
    const key = p.title.trim();
    byTitle.set(key, [...(byTitle.get(key) ?? []), p]);
  }
  add(
    'title',
    `Titles of ${n} similar past ${n === 1 ? 'position' : 'positions'}: ${[...byTitle.entries()]
      .map(([t, ps]) => (ps.length > 1 ? `${t} (${ps.length})` : t))
      .join('; ')}.`,
    similar,
  );

  // Skills named often enough to mean something.
  const bySkill = new Map<string, { label: string; from: PositionBrief[] }>();
  for (const p of similar)
    for (const skill of p.requiredSkills) {
      const key = skill.trim().toLowerCase();
      if (!key) continue;
      const entry = bySkill.get(key) ?? { label: skill.trim(), from: [] };
      entry.from.push(p);
      bySkill.set(key, entry);
    }
  const threshold = n >= 3 ? 2 : 1;
  for (const entry of [...bySkill.values()]
    .filter((e) => e.from.length >= threshold)
    .sort((a, b) => b.from.length - a.from.length || a.label.localeCompare(b.label))
    .slice(0, 8)) {
    add(
      'skill',
      `${entry.label} was a required skill in ${entry.from.length} of ${n} similar past positions.`,
      entry.from,
    );
  }

  // Experience asked for.
  const byExperience = new Map<string, PositionBrief[]>();
  for (const p of similar)
    if (p.requiredExperience?.trim()) {
      const key = p.requiredExperience.trim();
      byExperience.set(key, [...(byExperience.get(key) ?? []), p]);
    }
  for (const [text, from] of [...byExperience.entries()].slice(0, 4)) {
    add(
      'experience',
      `Required experience "${text}" in ${from.length} of ${n} similar past positions.`,
      from,
    );
  }

  // Compensation, per currency.
  const byCurrency = new Map<string, PositionBrief[]>();
  for (const p of similar)
    if (p.compMin !== null || p.compMax !== null)
      byCurrency.set(p.compCurrency, [...(byCurrency.get(p.compCurrency) ?? []), p]);
  for (const [currency, from] of byCurrency) {
    const lows = from.map((p) => p.compMin ?? p.compMax!);
    const highs = from.map((p) => p.compMax ?? p.compMin!);
    const middles = from.map((p, i) => (lows[i]! + highs[i]!) / 2);
    add(
      'compensation',
      `${currency} ${money(Math.min(...lows))} to ${money(Math.max(...highs))} across ${from.length} similar past ${from.length === 1 ? 'position' : 'positions'} (middle of the ranges: ${money(median(middles))}).`,
      from,
    );
  }

  // Work arrangement.
  const byArrangement = new Map<string, PositionBrief[]>();
  for (const p of similar)
    if (p.workArrangement) {
      byArrangement.set(p.workArrangement, [...(byArrangement.get(p.workArrangement) ?? []), p]);
    }
  if (byArrangement.size > 0) {
    add(
      'location',
      `Work arrangement of similar past positions: ${[...byArrangement.entries()]
        .map(([a, ps]) => `${a.replace(/_/g, ' ')} ${ps.length}`)
        .join(', ')}.`,
      [...byArrangement.values()].flat(),
    );
  }

  return items.map((item, i) => ({ id: `O${i + 1}`, ...item }));
}
