// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Level, ResumeKey } from './dataset';

/** Lower-case, no punctuation, one space: for comparing names, titles and employers. */
export const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export interface ProfileLike {
  fullName: string | null;
  email: string | null;
  careerHistory: { company: string; title: string; start: string | null }[];
  education: { school: string }[];
  majorAchievements: { text: string }[];
  leadershipExperience: string | null;
  teamSize: string | null;
}

const year = (s: string | null | undefined) => /\d{4}/.exec(s ?? '')?.[0] ?? null;

/** Numbers as written: `23%`, `1,200`, `$4.5M`, `5K`. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\$?\d[\d,.]*\d(?:%|[KMBkmb]\b)?|\$?\d(?:%|[KMBkmb]\b)?/g)].map((m) =>
    m[0].replace(/[.,]$/, ''),
  );
}

/**
 * Numbers the profile states that the source never does: invented facts (NFR-AI03). Dates and years
 * are ignored, they are checked by the career history.
 */
export function inventedNumbers(profileText: string, source: string): string[] {
  const known = new Set(numbersIn(source).map((n) => n.replace(/[$,]/g, '')));
  return [...new Set(numbersIn(profileText))].filter((n) => {
    const plain = n.replace(/[$,]/g, '');
    if (/^(19|20)\d{2}$/.test(plain)) return false;
    return !known.has(plain);
  });
}

export interface ProfileGrade {
  nameCorrect: boolean;
  emailCorrect: boolean;
  /** Share of the key's positions found with the right employer, title and start year. */
  positionsFound: number;
  /** Share of the key's schools found. */
  educationFound: number;
  invented: string[];
  /** Whole extraction: name and email right, 90% of positions, nothing invented. */
  pass: boolean;
}

export function gradeProfile(profile: ProfileLike, key: ResumeKey, source: string): ProfileGrade {
  const positions = key.facts.positions;
  const found = positions.filter((p) =>
    profile.careerHistory.some(
      (c) =>
        norm(c.company) === norm(p.employer) &&
        (norm(c.title).includes(norm(p.title)) || norm(p.title).includes(norm(c.title))) &&
        year(c.start) === year(p.start),
    ),
  ).length;
  const schools = key.facts.education.filter((e) =>
    profile.education.some((p) => norm(p.school) === norm(e.school)),
  ).length;
  const text = [
    ...profile.majorAchievements.map((a) => a.text),
    profile.leadershipExperience,
    profile.teamSize,
  ]
    .filter(Boolean)
    .join(' ');
  const invented = inventedNumbers(text, source);
  const grade = {
    nameCorrect: norm(profile.fullName) === norm(key.facts.full_name),
    emailCorrect: (profile.email ?? '').toLowerCase() === key.facts.email.toLowerCase(),
    positionsFound: positions.length === 0 ? 1 : found / positions.length,
    educationFound: key.facts.education.length === 0 ? 1 : schools / key.facts.education.length,
    invented,
  };
  return {
    ...grade,
    pass:
      grade.nameCorrect &&
      grade.emailCorrect &&
      grade.positionsFound >= 0.9 &&
      invented.length === 0,
  };
}

/** Criterion names in the answer key and in the app. */
export const CRITERION_MAP = {
  core_competencies: 'coreCompetencies',
  relevant_experience: 'relevantExperience',
  industry_functional: 'industryFunctional',
  career_level_years: 'careerLevel',
  location_work_arrangement: 'locationArrangement',
  education_certification: 'educationCertification',
  compensation_other: 'compensationOther',
} as const;

const ORDER: Record<Level, number> = { gap: 0, partial: 1, strong: 2, unknown: 1 };

export interface MatchGrade {
  /** Criteria with exactly the key's level. */
  exact: number;
  /** Criteria within one step of the key (an unknown on either side counts only when both are unknown). */
  withinOne: number;
  total: number;
}

export function gradeMatch(levels: Record<string, Level>, key: ResumeKey): MatchGrade {
  let exact = 0;
  let withinOne = 0;
  const entries = Object.entries(CRITERION_MAP);
  for (const [keyName, appName] of entries) {
    const expected = key.criteria[keyName]?.level;
    const got = levels[appName];
    if (!expected || !got) continue;
    if (expected === got) {
      exact++;
      withinOne++;
    } else if (
      expected !== 'unknown' &&
      got !== 'unknown' &&
      Math.abs(ORDER[expected] - ORDER[got]) <= 1
    ) {
      withinOne++;
    }
  }
  return { exact, withinOne, total: entries.length };
}

/** Fraction of JDs whose strong, partial and weak resumes score in that order (strict). */
export function rankingAccuracy(
  scoresByJd: Map<string, Partial<Record<'strong' | 'partial' | 'weak', number>>>,
): number {
  let ordered = 0;
  let judged = 0;
  for (const s of scoresByJd.values()) {
    if (s.strong === undefined || s.partial === undefined || s.weak === undefined) continue;
    judged++;
    if (s.strong > s.partial && s.partial > s.weak) ordered++;
  }
  return judged === 0 ? 0 : ordered / judged;
}

/** Largest minus smallest score over repeated runs or over a bias pair (NFR-AI04, TR-010). */
export function spread(scores: number[]): number {
  return scores.length === 0 ? 0 : Math.max(...scores) - Math.min(...scores);
}
