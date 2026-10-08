// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { claimSchema } from '../schemas/evidence';

const text = (max = 400) => z.string().trim().max(max);
const optionalText = (max = 400) => text(max).nullable();
const list = (max = 40) => z.array(z.string().trim().min(1).max(120)).max(max);

const careerEntry = z.object({
  company: text(160),
  title: text(160),
  /** As written in the source, such as "2019", "2019-03" or "Mar 2019"; null when not stated. */
  start: optionalText(40),
  /** Null when not stated; use `current` for a role that is still held. */
  end: optionalText(40),
  current: z.boolean(),
  summary: text(1200),
});

const educationEntry = z.object({
  school: text(160),
  degree: text(160),
  year: optionalText(20),
});

/**
 * The structured candidate profile (brief 4.2, FR-SRC-03). Fields the source does not contain are
 * null or empty, never guessed. The "potential" fields are labelled as inference by their evidence.
 */
export const candidateProfileModelOutputSchema = z.object({
  fullName: optionalText(160),
  email: optionalText(254),
  phone: optionalText(40),
  currentPosition: z.object({ title: optionalText(160), company: optionalText(160) }),
  careerHistory: z.array(careerEntry).max(40),
  education: z.array(educationEntry).max(15),
  coreSkills: list(),
  industryExperience: list(),
  technicalSkills: list(60),
  leadershipExperience: optionalText(800),
  teamSize: optionalText(120),
  careerProgression: optionalText(800),
  majorAchievements: z.array(claimSchema).max(15),
  location: optionalText(160),
  workAuthorization: optionalText(200),
  compensationExpectation: optionalText(200),
  potentialMotivation: claimSchema.nullable(),
  potentialConcerns: z.array(claimSchema).max(10),
});
export type CandidateProfileContent = z.infer<typeof candidateProfileModelOutputSchema>;

/** Same shape: the profile artifact content is what the model returned, after checking its quotes. */
export const candidateProfileContentSchema = candidateProfileModelOutputSchema;

export const PROFILE_TEXT_FIELDS = [
  'fullName',
  'email',
  'phone',
  'leadershipExperience',
  'teamSize',
  'careerProgression',
  'location',
  'workAuthorization',
  'compensationExpectation',
] as const;
export type ProfileTextField = (typeof PROFILE_TEXT_FIELDS)[number];

/**
 * A blank profile for a recruiter who fills it in by hand (FR-SRC-02): used when the AI cannot run,
 * or when the recruiter prefers to type it. Every field starts empty; nothing is guessed.
 */
export function emptyCandidateProfile(): CandidateProfileContent {
  return {
    fullName: null,
    email: null,
    phone: null,
    currentPosition: { title: null, company: null },
    careerHistory: [],
    education: [],
    coreSkills: [],
    industryExperience: [],
    technicalSkills: [],
    leadershipExperience: null,
    teamSize: null,
    careerProgression: null,
    majorAchievements: [],
    location: null,
    workAuthorization: null,
    compensationExpectation: null,
    potentialMotivation: null,
    potentialConcerns: [],
  };
}
