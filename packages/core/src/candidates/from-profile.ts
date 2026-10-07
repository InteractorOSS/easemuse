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
  /** Every employer named, current first: the input to the employer match keys. */
  employers: string[];
}

const MAX_SKILLS = 60;

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
    employers: [
      profile.currentPosition.company,
      ...profile.careerHistory.map((c) => c.company),
    ].filter((c): c is string => Boolean(c?.trim())),
  };
}
