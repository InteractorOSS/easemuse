// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

export type DocumentKind = 'resume' | 'jd';

export type QualityIssue = 'too_short' | 'high_non_text' | 'no_word_breaks';

export interface TextQuality {
  /** False means the text layer is not trustworthy: use the PDF-to-model fallback. */
  ok: boolean;
  chars: number;
  words: number;
  /** Share of characters that are neither letters, digits, whitespace nor ordinary punctuation. */
  nonTextRatio: number;
  issues: QualityIssue[];
}

/** Thresholds (ADR-010). Confirmed on clean documents in the T-F-23 spike (docs/planning/spikes/tf-23-extraction-quality.md); re-check on real resumes. */
export const QUALITY_THRESHOLDS = {
  minChars: { resume: 200, jd: 200 } satisfies Record<DocumentKind, number>,
  maxNonTextRatio: 0.3,
  /** Average "word" longer than this means word breaks were lost (glued-together glyphs). */
  maxAverageWordLength: 25,
} as const;

// Letters and numbers in any script (Hangul included), whitespace, and common punctuation/symbols.
const TEXT_CHAR = /[\p{L}\p{N}\p{M}\s.,;:!?'"()[\]{}\-–—_/\\@#&%+=*•·|<>~^$€£¥©®™°§¶…“”‘’«»]/u;

export function assessTextQuality(text: string, kind: DocumentKind): TextQuality {
  const trimmed = text.trim();
  const chars = [...trimmed].length;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  let nonText = 0;
  for (const ch of trimmed) if (!TEXT_CHAR.test(ch)) nonText += 1;
  const nonTextRatio = chars === 0 ? 1 : nonText / chars;

  const issues: QualityIssue[] = [];
  if (chars < QUALITY_THRESHOLDS.minChars[kind]) issues.push('too_short');
  if (nonTextRatio > QUALITY_THRESHOLDS.maxNonTextRatio) issues.push('high_non_text');
  if (words > 0 && chars / words > QUALITY_THRESHOLDS.maxAverageWordLength)
    issues.push('no_word_breaks');

  return { ok: issues.length === 0, chars, words, nonTextRatio, issues };
}
