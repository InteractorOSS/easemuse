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

// ── Pool search reasons (A8, US-205) ──────────────────────────────────────────────────────────

const GENDERED = /\b(he|she|him|her|his|hers|mr|mrs|ms|male|female|man|woman|husband|wife)\b/gi;
const LEAK = /[^\s@]+@[^\s@]+\.[^\s@]+|https?:\/\/\S+|\+?\d[\d\s().-]{7,}\d/;

export interface ReasonGrade {
  words: number;
  /** One short sentence, as the prompt asks (at most 30 words). */
  withinLength: boolean;
  /** An email, link, phone number or a word of the candidate's name appeared in the reason. */
  leaksIdentity: boolean;
  /** Gendered words: the prompt asks for "the candidate". */
  gendered: string[];
  /** Numbers the card and the success profile never state. */
  invented: string[];
  pass: boolean;
}

/** Grades one "why this person may fit" line against the card the model read and the profile it compared with. */
export function gradeReason(
  reason: string,
  context: { source: string; names: readonly string[] },
): ReasonGrade {
  const words = reason.trim().split(/\s+/).filter(Boolean).length;
  const lowered = reason.toLowerCase();
  const leaksIdentity =
    LEAK.test(reason) ||
    context.names.some((n) => n.length >= 2 && lowered.includes(n.toLowerCase()));
  const gendered = [...new Set([...reason.matchAll(GENDERED)].map((m) => m[0].toLowerCase()))];
  const invented = inventedNumbers(reason, context.source);
  const withinLength = words >= 3 && words <= 30;
  return {
    words,
    withinLength,
    leaksIdentity,
    gendered,
    invented,
    pass: withinLength && !leaksIdentity && gendered.length === 0 && invented.length === 0,
  };
}

// ── Benchmark citations (A3, US-108) ──────────────────────────────────────────────────────────

export interface BenchmarkGradeInput {
  /** What the structuring step returned, before code kept or dropped anything. */
  raw: {
    web: { text: string; sourceIds: string[] }[];
    suggestions: { basedOn: string[] }[];
  };
  /** The sources the research step cited. */
  research: { findings: string; sources: { id: string; url: string; citedTexts: string[] }[] };
  /** The stored report. */
  content: {
    web: { text: string; sources: { url: string; retrievedOn: string }[] }[];
    suggestions: unknown[];
    droppedWebItems: number;
  };
  isPaid: (url: string) => boolean;
}

export interface BenchmarkGrade {
  /** Share of the model's web findings that carried at least one label of a cited page. */
  rawCitedRate: number;
  keptItems: number;
  /** Every kept item has a source with an http(s) link the research really cited, and a date. */
  allLinked: boolean;
  anyPaid: boolean;
  /** Share of kept items whose numbers all appear in the research text or its cited passages. */
  numbersSupported: number;
  suggestionsKeptRate: number;
}

export function gradeBenchmark(input: BenchmarkGradeInput): BenchmarkGrade {
  const cited = new Set(input.research.sources.map((s) => s.id));
  const raw = input.raw.web;
  const rawCited = raw.filter((w) => w.sourceIds.some((id) => cited.has(id))).length;
  const urls = new Set(input.research.sources.map((s) => s.url));
  const allLinked = input.content.web.every(
    (w) =>
      w.sources.length > 0 &&
      w.sources.every(
        (s) => /^https?:\/\//.test(s.url) && urls.has(s.url) && s.retrievedOn.length > 0,
      ),
  );
  const evidence = `${input.research.findings}\n${input.research.sources.flatMap((s) => s.citedTexts).join('\n')}`;
  const supported = input.content.web.filter((w) => inventedNumbers(w.text, evidence).length === 0);
  return {
    rawCitedRate: raw.length === 0 ? 1 : rawCited / raw.length,
    keptItems: input.content.web.length,
    allLinked,
    anyPaid: input.content.web.some((w) => w.sources.some((s) => input.isPaid(s.url))),
    numbersSupported:
      input.content.web.length === 0 ? 1 : supported.length / input.content.web.length,
    suggestionsKeptRate:
      input.raw.suggestions.length === 0
        ? 1
        : input.content.suggestions.length / input.raw.suggestions.length,
  };
}
