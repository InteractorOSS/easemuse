// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { CandidateProfileContent } from '../artifacts/candidate-profile';

/** What the candidate row keeps from the approved profile, for lists, filters and duplicate checks. */
export interface CandidateFields {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
  location: string | null;
  skills: string[];
  yearsExperience: number | null;
  /** A level read from the current title (Director, Senior...), or null when the title names none. */
  seniority: string | null;
  /** Every employer named, current first: the input to the employer match keys. */
  employers: string[];
}

const MAX_SKILLS = 60;

/**
 * The seniority level a job title names, highest first, so "Senior Director" is a Director. Null
 * when the title says nothing about level (nothing is guessed). English and common Korean titles.
 */
export function seniorityFromTitle(title: string | null | undefined): string | null {
  const t = (title ?? '').toLowerCase();
  if (!t.trim()) return null;
  const rules: [string, RegExp][] = [
    ['C-level', /\b(chief|ceo|cto|cfo|coo|cio|chro|cmo)\b|대표이사|최고/],
    ['VP', /\b(vp|svp|evp|vice president)\b|부사장|전무|상무/],
    ['Director', /\b(director|head of)\b|이사|본부장|실장/],
    ['Manager', /\bmanager\b|매니저|팀장|부장|차장|과장/],
    ['Lead', /\b(lead|principal|staff)\b|수석|리드/],
    ['Senior', /\b(senior|sr)\b|시니어|선임/],
    ['Junior', /\b(junior|jr|associate|assistant|intern|trainee)\b|주니어|사원|인턴|신입/],
  ];
  return rules.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** The earliest 4-digit year in a free-form date such as "2019", "03/2019" or "Mar 2019"; null if none. */
export function firstYear(value: string | null | undefined): number | null {
  const match = value?.match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

/**
 * Reads the denormalized fields from a candidate profile (T-2-08). Years of experience is counted
 * from the earliest stated start year and is null when no start year is stated: nothing is guessed.
 */
export function candidateFieldsFromProfile(
  profile: CandidateProfileContent,
  now: Date = new Date(),
): CandidateFields {
  const years = profile.careerHistory
    .map((c) => firstYear(c.start))
    .filter((y): y is number => y !== null);
  const earliest = years.length ? Math.min(...years) : null;
  const skills = [
    ...new Set(
      [...profile.coreSkills, ...profile.technicalSkills].map((s) => s.trim()).filter(Boolean),
    ),
  ].slice(0, MAX_SKILLS);
  return {
    fullName: profile.fullName?.trim() || null,
    email: profile.email?.trim() || null,
    phone: profile.phone?.trim() || null,
    currentTitle: profile.currentPosition.title?.trim() || null,
    location: profile.location?.trim() || null,
    skills,
    yearsExperience: earliest === null ? null : Math.max(0, now.getUTCFullYear() - earliest),
    seniority: seniorityFromTitle(profile.currentPosition.title),
    employers: [
      profile.currentPosition.company,
      ...profile.careerHistory.map((c) => c.company),
    ].filter((c): c is string => Boolean(c?.trim())),
  };
}

/**
 * The text the pool search indexes, in three weights (T-2-08): name and title first, then skills
 * and employers, then everything else the profile says. Plain text; the database makes the tsvector.
 */
export function candidateSearchParts(
  profile: CandidateProfileContent,
  fields: CandidateFields,
): { primary: string; secondary: string; rest: string } {
  return {
    primary: [fields.fullName, fields.currentTitle, ...profile.careerHistory.map((c) => c.title)]
      .filter(Boolean)
      .join(' '),
    secondary: [...fields.skills, ...profile.industryExperience, ...fields.employers].join(' '),
    rest: [
      fields.location,
      fields.seniority,
      profile.leadershipExperience,
      profile.careerProgression,
      ...profile.careerHistory.map((c) => c.summary),
      ...profile.education.map((e) => `${e.school} ${e.degree}`),
      ...profile.majorAchievements.map((a) => a.text),
    ]
      .filter(Boolean)
      .join(' '),
  };
}
