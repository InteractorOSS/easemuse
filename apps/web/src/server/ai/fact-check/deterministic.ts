// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import type { FactCheckWarning } from '@easemuse/core';

/**
 * Fact check, step 1 (ADR-006, T-AI-08): mechanical. Pull the checkable facts out of a generated
 * document (numbers and amounts, years, and proper-noun phrases such as employers, schools and job
 * titles) and look for each one in the source texts. Anything not found becomes a warning the
 * recruiter must resolve. It is deliberately simple and a little strict; step 2 (an LLM verifier)
 * covers claims it cannot see, and every warning is a human decision, never an automatic edit.
 */

export type FactKind = 'number' | 'year' | 'entity';

export interface Fact {
  kind: FactKind;
  /** Canonical form used for matching (for example `2000000` for "2M", `40%`, `acme corp`). */
  key: string;
  /** How it appeared in the text. */
  text: string;
  /** The sentence or line it appeared in, for the warning. */
  context: string;
  /**
   * For a phrase that opens a sentence: the same phrase without its first word, which may only be
   * capitalised because it starts the sentence ("Previously Software Engineer"). Either form counts as support.
   */
  alt?: string;
}

const MULTIPLIER: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  million: 1e6,
  b: 1e9,
  billion: 1e9,
};
const CURRENCY = '[$€£₩]';
// A number with optional currency, thousands separators, decimals and a magnitude or % suffix.
const NUMBER = new RegExp(
  String.raw`(?<![\w.,])(${CURRENCY}\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|percent\b|x\b|k\b|m\b|b\b|thousand\b|million\b|billion\b)?(?![\w])`,
  'giu',
);
const YEAR = /^(?:19[5-9]\d|20\d{2})$/;

const MONTHS = new Set(
  'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec'.split(
    ' ',
  ),
);

/** Capitalised words that start bullets and sentences in resumes but are not names. */
const LEADING_VERBS = new Set(
  `led built managed developed designed created delivered reduced increased improved launched owned drove implemented directed oversaw
   established mentored partnered collaborated worked responsible served founded optimized optimised migrated architected spearheaded
   achieved analyzed analysed coordinated maintained supported ran grew scaled negotiated trained hired promoted wrote shipped
   the a an and or in on at for with to of by as from during across including using via also`.split(
    /\s+/,
  ),
);

const STOP_PHRASES = new Set([
  'i',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'vp',
  'ai',
  'ml',
  'api',
  'ui',
  'ux',
  'it',
  'hr',
  'qa',
  'us',
  'usa',
  'uk',
]);

export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}%$€£₩.\s'-]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ') // "B.S." and "Inc." become words; "3.5" stays a number
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalNumber(match: RegExpExecArray): { key: string; text: string } | null {
  const [text, currency, whole, decimals, suffix] = match;
  const base = Number(`${whole!.replace(/,/g, '')}${decimals ?? ''}`);
  if (!Number.isFinite(base)) return null;
  const s = suffix?.toLowerCase();
  if (s === '%' || s === 'percent') return { key: `${base}%`, text };
  if (s === 'x') return { key: `${base}x`, text };
  const value = base * (s ? (MULTIPLIER[s] ?? 1) : 1);
  return { key: `${currency ? '$' : ''}${value}`, text };
}

/** Splits into sentences and bullet lines, trimming list markers (which look like numbers). */
function segments(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, ''))
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function entityPhrases(segment: string): { phrase: string; atStart: boolean }[] {
  const phrases: { phrase: string; atStart: boolean }[] = [];
  // Words that start with a capital or contain an internal capital or a digit (PostgreSQL, GitHub, 3M).
  const tokens = segment.split(/\s+/);
  let run: string[] = [];
  const flush = (atStart: boolean) => {
    let words = run;
    run = [];
    // Drop leading action verbs and function words that are only capitalised at the start of a sentence.
    while (words.length > 0 && atStart && LEADING_VERBS.has(words[0]!.toLowerCase()))
      words = words.slice(1);
    while (words.length > 0 && LEADING_VERBS.has(words[words.length - 1]!.toLowerCase()))
      words = words.slice(0, -1);
    if (words.length === 0) return;
    const phrase = words.join(' ');
    const lower = phrase.toLowerCase();
    if (STOP_PHRASES.has(lower) || MONTHS.has(lower)) return;
    // A lone ordinary word at the start of a segment is just a capitalised sentence opener.
    if (words.length === 1 && atStart && !/[A-Z].*[A-Z]|\d/.test(words[0]!.slice(1))) return;
    phrases.push({ phrase, atStart });
  };
  tokens.forEach((raw, index) => {
    const word = raw.replace(/^[("'“‘]+|[)"'”’,;:.!?]+$/g, '');
    const capitalised = /^[A-Z][\p{L}\p{N}&.'-]*$/u.test(word) && !MONTHS.has(word.toLowerCase());
    const connector =
      /^(?:of|&|for)$/i.test(word) &&
      run.length > 0 &&
      /^[A-Z]/.test((tokens[index + 1] ?? '').replace(/^[("'“‘]+/, ''));
    if (capitalised || connector) run.push(word);
    else flush(index - run.length === 0);
    if (/[,;:.!?)]$/.test(raw) && run.length > 0) flush(index - run.length + 1 === 0);
  });
  flush(tokens.length - run.length === 0);
  return phrases;
}

/** Extracts the checkable facts from `text`. */
export function extractFacts(text: string): Fact[] {
  const facts: Fact[] = [];
  for (const context of segments(text)) {
    for (const match of context.matchAll(NUMBER)) {
      const c = canonicalNumber(match as RegExpExecArray);
      if (!c) continue;
      const bare = c.text.replace(/[$€£₩,\s]/g, '');
      if (YEAR.test(bare)) facts.push({ kind: 'year', key: bare, text: c.text.trim(), context });
      else facts.push({ kind: 'number', key: c.key, text: c.text.trim(), context });
    }
    for (const { phrase, atStart } of entityPhrases(context)) {
      const words = phrase.split(' ');
      const alt = atStart && words.length > 2 ? normaliseText(words.slice(1).join(' ')) : undefined;
      facts.push({
        kind: 'entity',
        key: normaliseText(phrase),
        text: phrase,
        context,
        ...(alt ? { alt } : {}),
      });
    }
  }
  return facts;
}

/** The searchable form of a source: its fact keys and its lines (for phrase checks). */
export interface SourceIndex {
  numbers: Set<string>;
  lines: string[];
}

export function indexSources(sources: string[]): SourceIndex {
  const numbers = new Set<string>();
  const lines: string[] = [];
  for (const source of sources) {
    for (const fact of extractFacts(source)) if (fact.kind !== 'entity') numbers.add(fact.key);
    // Plain years and numbers that the capital-letter pass would miss are also indexed by raw scan.
    for (const m of source.matchAll(NUMBER)) {
      const c = canonicalNumber(m as RegExpExecArray);
      if (c)
        numbers.add(
          YEAR.test(c.text.replace(/[$€£₩,\s]/g, '')) ? c.text.replace(/[$€£₩,\s]/g, '') : c.key,
        );
    }
    for (const line of source.split(/\n+|(?<=[.!?])\s+/)) {
      const n = normaliseText(line);
      if (n) lines.push(n);
    }
  }
  return { numbers, lines };
}

function wordSupported(word: string, lineWords: string[]): boolean {
  return lineWords.some(
    (w) =>
      w === word ||
      (word.length >= 4 && (w.startsWith(word) || word.startsWith(w)) && w.length >= 4),
  );
}

function phraseSupported(key: string, index: SourceIndex): boolean {
  if (index.lines.some((line) => line.includes(key))) return true;
  const words = key.split(' ').filter(Boolean);
  if (words.length < 2) return false;
  // Every word appears in one source line: allows reordering ("Engineer, Staff") and corp/corporation.
  return index.lines.some((line) => {
    const lineWords = line.split(' ');
    return words.every((w) => wordSupported(w, lineWords));
  });
}

const warningId = (fact: Fact) =>
  `det-${createHash('sha1').update(`${fact.kind}:${fact.key}`).digest('hex').slice(0, 10)}`;
const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Facts in `draft` that none of `sources` supports, one warning per distinct fact. */
export function checkAgainstSources(draft: string, sources: string[]): FactCheckWarning[] {
  const index = indexSources(sources);
  const seen = new Set<string>();
  const warnings: FactCheckWarning[] = [];
  for (const fact of extractFacts(draft)) {
    const supported =
      fact.kind === 'entity'
        ? phraseSupported(fact.key, index) ||
          (fact.alt !== undefined && phraseSupported(fact.alt, index))
        : index.numbers.has(fact.key);
    if (supported) continue;
    const id = warningId(fact);
    if (seen.has(id)) continue;
    seen.add(id);
    warnings.push({ id, step: 'deterministic', claim: `${fact.text}: "${clip(fact.context)}"` });
  }
  return warnings;
}
