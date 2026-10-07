// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/**
 * Matching criteria and their default weights (brief §5.1). The overall score is a weighted sum of
 * criterion scores, so the weights must add up to 100 (ADR-007). Recruiters can change them per
 * position; these are the agency's defaults.
 */
export const MATCH_WEIGHT_KEYS = [
  'coreCompetencies',
  'relevantExperience',
  'industryFunctional',
  'careerLevel',
  'locationArrangement',
  'educationCertification',
  'compensationOther',
] as const;
export type MatchWeightKey = (typeof MATCH_WEIGHT_KEYS)[number];

export const DEFAULT_MATCH_WEIGHTS: Record<MatchWeightKey, number> = {
  coreCompetencies: 40,
  relevantExperience: 20,
  industryFunctional: 15,
  careerLevel: 10,
  locationArrangement: 5,
  educationCertification: 5,
  compensationOther: 5,
};

export const matchingWeightsSchema = z
  .object(
    Object.fromEntries(
      MATCH_WEIGHT_KEYS.map((key) => [key, z.number().int().min(0).max(100)]),
    ) as Record<MatchWeightKey, z.ZodNumber>,
  )
  .refine((w) => Object.values(w).reduce((sum, n) => sum + n, 0) === 100, {
    message: 'Weights must add up to 100',
    path: ['_sum'],
  });
export type MatchingWeights = z.infer<typeof matchingWeightsSchema>;

/** What happens when a guard is not satisfied: stop the action, or warn and let the recruiter proceed (FR-TEN-03). */
export const GUARD_MODES = ['block', 'warn'] as const;
export type GuardMode = (typeof GUARD_MODES)[number];

export const GUARD_KEYS = [
  'jdApproval',
  'resumeApproval',
  'consent',
  'recruiterAssessment',
] as const;
export type GuardKey = (typeof GUARD_KEYS)[number];

export const VISIBILITY_RULES = ['all_positions', 'own_and_shared'] as const;
export type VisibilityRule = (typeof VISIBILITY_RULES)[number];

export const UI_LOCALES = ['en', 'ko'] as const;

export const DEFAULT_REJECTION_REASONS = [
  'Not enough experience',
  'Skills do not match',
  'Compensation expectations',
  'Location or work arrangement',
  'Candidate withdrew',
  'Client chose another candidate',
  'Position cancelled or on hold',
  'Other',
] as const;

/** All four guards, always together: a partial object would silently reset the others. */
const guardModesSchema = z.object(
  Object.fromEntries(GUARD_KEYS.map((key) => [key, z.enum(GUARD_MODES)])) as Record<
    GuardKey,
    z.ZodEnum<{ block: 'block'; warn: 'warn' }>
  >,
);

const rejectionReasonsSchema = z
  .array(z.string().trim().min(2).max(60))
  .min(1)
  .max(30)
  .refine((list) => new Set(list.map((s) => s.toLowerCase())).size === list.length, {
    message: 'Reasons must be different',
  });

/** The agency's defaults and rules (FR-TEN-03). Stored in `Agency.settings`; every key has a default. */
export const agencySettingsSchema = z.object({
  defaultMatchingWeights: matchingWeightsSchema.default(DEFAULT_MATCH_WEIGHTS),
  /** Days after touch 1 for touch 2, and after touch 2 for touch 3 (open question Q-16: 4 and 7). */
  outreachIntervalsDays: z
    .tuple([z.number().int().min(1).max(60), z.number().int().min(1).max(60)])
    .default([4, 7]),
  /** Warn when a candidate was contacted by anyone in the last N days (FR-OUT-07; Q-16: 30). */
  recentlyContactedDays: z.number().int().min(0).max(365).default(30),
  guardModes: guardModesSchema.default({
    jdApproval: 'block',
    resumeApproval: 'block',
    consent: 'block',
    recruiterAssessment: 'block',
  }),
  rejectionReasons: rejectionReasonsSchema.default([...DEFAULT_REJECTION_REASONS]),
  visibility: z.enum(VISIBILITY_RULES).default('all_positions'),
  /** Explain-only mode (ADR-007, Q-06): match levels and evidence are shown, numeric scores are hidden. */
  explainOnly: z.boolean().default(false),
  /** Agency default UI language (ADR-015). Absent = English. */
  locale: z.enum(UI_LOCALES).optional(),
  /** Email transport for this agency (ADR-009); capture-only until a provider is configured. */
  emailTransport: z.enum(['dev-capture', 'log-only']).optional(),
});
export type AgencySettings = z.infer<typeof agencySettingsSchema>;

/**
 * Reads `Agency.settings` leniently: anything missing or malformed falls back to its default, so a
 * hand-edited or older row never breaks the app. Unknown keys are dropped.
 */
export function parseAgencySettings(raw: unknown): AgencySettings {
  const object =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const whole = agencySettingsSchema.safeParse(object);
  if (whole.success) return whole.data;
  const picked: Record<string, unknown> = {};
  for (const key of Object.keys(
    agencySettingsSchema.shape,
  ) as (keyof typeof agencySettingsSchema.shape)[]) {
    if (agencySettingsSchema.shape[key].safeParse(object[key]).success) picked[key] = object[key];
  }
  return agencySettingsSchema.parse(picked);
}

/**
 * `PATCH /settings`: any subset of the settings. A key you send replaces that key as a whole
 * (no defaults are applied here, so omitting a key leaves it as it is).
 */
const shape = agencySettingsSchema.shape;
export const agencySettingsPatchSchema = z
  .object({
    defaultMatchingWeights: shape.defaultMatchingWeights.removeDefault().optional(),
    outreachIntervalsDays: shape.outreachIntervalsDays.removeDefault().optional(),
    recentlyContactedDays: shape.recentlyContactedDays.removeDefault().optional(),
    guardModes: shape.guardModes.removeDefault().optional(),
    rejectionReasons: shape.rejectionReasons.removeDefault().optional(),
    visibility: shape.visibility.removeDefault().optional(),
    explainOnly: shape.explainOnly.removeDefault().optional(),
    locale: shape.locale,
    emailTransport: shape.emailTransport,
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: 'Nothing to change',
  });
export type AgencySettingsPatch = z.infer<typeof agencySettingsPatchSchema>;
