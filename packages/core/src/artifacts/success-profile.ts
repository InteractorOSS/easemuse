// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { REQUIREMENT_CATEGORIES } from './structured-jd';

/** Where a criterion comes from: the approved JD, or what the hiring manager said in the intake. */
export const CRITERION_BASES = ['jd', 'intake'] as const;

const criterionShape = {
  text: z.string().trim().min(1).max(500),
  /** `disqualifying` is the deal-breaker list. */
  category: z.enum(REQUIREMENT_CATEGORIES),
  basis: z.enum(CRITERION_BASES),
};

/** What the model returns for A5: no ids yet. */
export const successProfileModelOutputSchema = z.object({
  summary: z.string().trim().max(1500),
  criteria: z.array(z.object(criterionShape)).max(60),
  expectations: z.object({ sixMonths: z.string().max(1500), twelveMonths: z.string().max(1500) }),
  keyChallenges: z.array(z.string().trim().min(1).max(400)).max(12),
});
export type SuccessProfileModelOutput = z.infer<typeof successProfileModelOutputSchema>;

/**
 * The Candidate Success Profile (brief 3.4, FR-INT-11): the confirmed definition of the ideal
 * candidate. Matching reads the approved version and records which one it used.
 */
export const successProfileContentSchema = z.object({
  summary: z.string().trim().max(1500),
  criteria: z.array(z.object({ id: z.string().min(1).max(64), ...criterionShape })).max(100),
  expectations: z.object({ sixMonths: z.string().max(1500), twelveMonths: z.string().max(1500) }),
  keyChallenges: z.array(z.string().trim().min(1).max(400)).max(20),
});
export type SuccessProfileContent = z.infer<typeof successProfileContentSchema>;
