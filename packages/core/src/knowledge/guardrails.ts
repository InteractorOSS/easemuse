// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Guardrails of the reuse features (brief 14, NFR-AI04, FR-AI-09): the history and the pattern
 * reports describe what happened in the agency's own records. They never name or rank people by a
 * protected characteristic, and they never present a handful of records as a trend.
 */

/** Fewer records than this and a number is shown with a "few records" warning (brief 14: patterns, not proof). */
export const MIN_SAMPLE = 5;

export const isSmallSample = (n: number): boolean => n < MIN_SAMPLE;

/**
 * Words that name or point to a protected characteristic: age, gender, race, nationality, religion,
 * disability and health, marital and family status, sexual orientation (English and Korean). Used
 * two ways: dimension values (a skill, a rejection reason) that match are withheld from a report,
 * and a sentence that matches is thrown away from an AI summary. A match is a reason to leave
 * something out, never a classification of a person, so it errs on the side of leaving out.
 */
const LATIN: RegExp[] = [
  // age
  /\b(?:age|aged|ages|ageing|aging|young|younger|youngest|old|older|oldest|elderly|youthful|millennials?|gen[ -]?z|boomers?|retirement|retiring|years?[- ]old|yo)\b/i,
  // gender and sex
  /\b(?:gender|genders|sex|sexes|male|males|female|females|man|men|woman|women|boy|boys|girl|girls|masculine|feminine|maternity|paternity|pregnan\w*|childbearing)\b/i,
  // race, ethnicity, nationality, origin
  /\b(?:race|races|racial|ethnic|ethnicity|ethnicities|caucasian|hispanic|latino|latina|asian|african|arab|nationality|nationalities|national origin|citizenship|citizen|citizens|immigrant|immigrants|foreigner|foreigners|accent|skin colou?r)\b/i,
  // religion
  /\b(?:religion|religious|christian|muslim|islamic|jewish|hindu|buddhist|catholic|protestant|atheist|church|mosque|temple)\b/i,
  // disability and health
  /\b(?:disability|disabilities|disabled|handicap\w*|illness|chronic|medical condition|health condition|wheelchair|mental health|impairment)\b/i,
  // marital and family status
  /\b(?:marital|married|unmarried|divorced|spouse|husband|wife|kids|children|childcare|family status|family plans|single mother|single father)\b/i,
  // sexual orientation and gender identity
  /\b(?:sexual orientation|gay|lesbian|lgbt\w*|transgender|trans|pronouns)\b/i,
];

/** Korean has no word boundaries to lean on, so these are plain substrings. */
const KOREAN =
  /나이|연령|젊은|고령|성별|남성|여성|남자|여자|인종|국적|외국인|종교|장애|건강상태|결혼|미혼|기혼|임신|출산|자녀|성적\s*지향/u;

/** True when the text names or points to a protected characteristic. */
export function mentionsProtected(text: string): boolean {
  return LATIN.some((re) => re.test(text)) || KOREAN.test(text);
}

/**
 * What a report may group candidates by. Every entry is a job-related characteristic of the career
 * (brief 14, question 7): the level of the current title, the span of experience in coarse steps,
 * the skills the profile lists, and where the agency found the person. Nothing here is read from a
 * photo, a birth date, a name, a marital or family field, or any free text; the loader that feeds
 * the reports cannot select those fields (see `server/knowledge/facts.ts`).
 */
export const PATTERN_DIMENSIONS = ['seniority', 'experience', 'skill', 'source'] as const;
export type PatternDimension = (typeof PATTERN_DIMENSIONS)[number];

/** The coarse steps of the experience dimension: wide on purpose, so no band singles out a person. */
export const EXPERIENCE_BANDS = ['0-2 years', '3-5 years', '6-10 years', '11+ years'] as const;

export function experienceBand(years: number | null | undefined): string | null {
  if (years === null || years === undefined || !Number.isFinite(years) || years < 0) return null;
  if (years <= 2) return EXPERIENCE_BANDS[0];
  if (years <= 5) return EXPERIENCE_BANDS[1];
  if (years <= 10) return EXPERIENCE_BANDS[2];
  return EXPERIENCE_BANDS[3];
}
