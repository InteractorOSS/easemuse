// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { CandidateProfileContent } from '../artifacts/candidate-profile';
import type { SuccessProfileContent } from '../artifacts/success-profile';

/**
 * The text that is embedded for a candidate or a success profile (ADR-008). Only the approved
 * profile feeds it, and it never contains the name, the email, the phone number or a link: those
 * identify the person, tell the model nothing about fit, and must not leave the system (FR-AI-09).
 * Voyage and the models see this text and nothing else.
 */

const EMAIL = /[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[^\s@<>()[\]]+/g;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github)\.com\/\S+/gi;
// A phone number: 7 or more digits, with the usual separators and an optional country prefix.
const PHONE = /(?<![\w.])\+?\d[\d\s().-]{6,}\d(?![\w])/g;

// A year followed by a month: "2019-03", "2019/3".
const DATE_RANGE = /(?:^|\D)(?:19|20)\d{2}[-/.]\d{1,2}(?!\d)/;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words of the candidate's name that may appear in free text ("Kim Minsu", "Minsu Kim" -> kim, minsu). */
export function identityTokens(fullName: string | null | undefined): string[] {
  return (fullName ?? '')
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Removes emails, links, phone numbers and the given name words from free text. A name word is cut
 * wherever it stands as a whole word, in any letter case.
 */
export function scrubIdentity(text: string, names: readonly string[] = []): string {
  let out = text
    .replace(EMAIL, ' ')
    .replace(URL_LIKE, ' ')
    // Date ranges such as "2019-03 - 2021-05" look like numbers but are not phone numbers.
    .replace(PHONE, (match) => (DATE_RANGE.test(match) ? match : ' '));
  for (const token of names) {
    const pattern = /^[\w]+$/u.test(token)
      ? new RegExp(`\\b${escapeRegExp(token)}\\b`, 'giu')
      : new RegExp(escapeRegExp(token), 'giu'); // Hangul and other scripts have no \b
    out = out.replace(pattern, ' ');
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const line = (label: string, value: string | null | undefined) =>
  value && value.trim() ? `${label}: ${value.trim()}` : null;

/** The approved profile as plain text for embedding, without identity fields. */
export function candidateEmbeddingText(profile: CandidateProfileContent): string {
  const lines = [
    line(
      'Current position',
      [profile.currentPosition.title, profile.currentPosition.company].filter(Boolean).join(' at '),
    ),
    line('Location', profile.location),
    line('Leadership', profile.leadershipExperience),
    line('Team size', profile.teamSize),
    line('Career progression', profile.careerProgression),
    line('Core skills', profile.coreSkills.join(', ')),
    line('Technical skills', profile.technicalSkills.join(', ')),
    line('Industry experience', profile.industryExperience.join(', ')),
    ...profile.careerHistory.map((j) =>
      `Job: ${j.title} at ${j.company}, ${j.start ?? '?'} to ${j.current ? 'present' : (j.end ?? '?')}. ${j.summary}`.trim(),
    ),
    ...profile.education.map(
      (e) => `Education: ${e.degree}, ${e.school}${e.year ? `, ${e.year}` : ''}`,
    ),
    ...profile.majorAchievements.map((a) => `Achievement: ${a.text}`),
  ].filter((l): l is string => Boolean(l));
  return scrubIdentity(lines.join('\n'), identityTokens(profile.fullName));
}

/** The confirmed success profile as plain text for embedding (deal-breakers are not part of what a person looks like). */
export function successProfileEmbeddingText(
  profile: SuccessProfileContent,
  position?: { title: string; location: string },
): string {
  const lines = [
    position ? `Role: ${position.title} (${position.location})` : null,
    line('Summary', profile.summary),
    ...profile.criteria
      .filter((c) => c.category !== 'disqualifying')
      .map((c) => `${c.category.replace('_', ' ')}: ${c.text}`),
    line('After 6 months', profile.expectations.sixMonths),
    line('After 1 year', profile.expectations.twelveMonths),
    ...profile.keyChallenges.map((c) => `Challenge: ${c}`),
  ].filter((l): l is string => Boolean(l));
  return lines.join('\n');
}
