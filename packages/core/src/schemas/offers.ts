// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** The nine things a recruiter manages from offer to start date (brief 12, FR-OFF-01). */
export const OFFER_MILESTONES = [
  'offerPreparation',
  'compensationDiscussion',
  'candidateExpectation',
  'counterofferRisk',
  'resignationTiming',
  'startDate',
  'offerAcceptance',
  'preEmploymentProcess',
  'onboarding',
] as const;
export type OfferMilestone = (typeof OFFER_MILESTONES)[number];

export const MILESTONE_STATUSES = ['not_started', 'in_progress', 'done'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** A day, `YYYY-MM-DD`. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const milestoneSchema = z.object({
  status: z.enum(MILESTONE_STATUSES).default('not_started'),
  date: day.nullable().default(null),
  notes: z.string().trim().max(1000).default(''),
});
export type MilestoneValue = z.infer<typeof milestoneSchema>;

export const milestonesSchema = z.object(
  Object.fromEntries(
    OFFER_MILESTONES.map((k) => [k, milestoneSchema.default(() => milestoneSchema.parse({}))]),
  ) as Record<OfferMilestone, z.ZodDefault<typeof milestoneSchema>>,
);
export type Milestones = z.infer<typeof milestonesSchema>;

export const COUNTEROFFER_RISKS = ['low', 'medium', 'high'] as const;

/** `PUT /pipeline/:id/offer`: any of these; milestones not mentioned stay as they are. */
export const saveOfferInputSchema = z.object({
  milestones: z
    .object(
      Object.fromEntries(
        OFFER_MILESTONES.map((k) => [k, milestoneSchema.partial().optional()]),
      ) as Record<
        OfferMilestone,
        z.ZodOptional<
          z.ZodObject<{
            status: z.ZodOptional<
              z.ZodDefault<
                z.ZodEnum<{ not_started: 'not_started'; in_progress: 'in_progress'; done: 'done' }>
              >
            >;
            date: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
            notes: z.ZodOptional<z.ZodDefault<z.ZodString>>;
          }>
        >
      >,
    )
    .optional(),
  counterofferRisk: z.enum(COUNTEROFFER_RISKS).nullable().optional(),
  resignationDate: day.nullable().optional(),
  startDate: day.nullable().optional(),
});
export type SaveOfferInput = z.infer<typeof saveOfferInputSchema>;

export const OFFER_OUTCOMES = ['accepted', 'declined', 'reneged', 'started'] as const;
export type OfferOutcome = (typeof OFFER_OUTCOMES)[number];

/** `POST /pipeline/:id/offer/outcome` (FR-OFF-03): each outcome is the recruiter's action, with a date. */
export const offerOutcomeInputSchema = z
  .object({
    outcome: z.enum(OFFER_OUTCOMES),
    at: day,
    /** Declined: a reason from the agency's list. */
    reasonCode: z.string().trim().min(2).max(60).optional(),
    /** Reneged needs words; Declined may add some. */
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((v) => v.outcome !== 'declined' || Boolean(v.reasonCode), {
    message: 'Choose a reason',
    path: ['reasonCode'],
  })
  .refine((v) => v.outcome !== 'reneged' || Boolean(v.reason), {
    message: 'Say what happened',
    path: ['reason'],
  });
export type OfferOutcomeInput = z.infer<typeof offerOutcomeInputSchema>;

const DAY_MS = 86_400_000;
const startOfDayUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const dayToMs = (value: string) => Date.parse(`${value}T00:00:00Z`);

/**
 * The next reminder until the start date (FR-OFF-02, US-1002): the day after the resignation date
 * (check in), a week before the start, and the day after the start. Returns the first one that has
 * not passed, or null. One reminder is open at a time; completing it schedules the next.
 */
export function nextOfferReminder(
  offer: { resignationDate: string | null; startDate: string | null; outcome: string | null },
  now: Date,
  /** Only reminders after this moment (the one just completed). */
  after?: Date,
): { kind: 'after_resignation' | 'week_before_start' | 'day_after_start'; dueAt: Date } | null {
  if (offer.outcome && offer.outcome !== 'accepted') return null;
  const today = startOfDayUtc(now);
  const candidates = [
    offer.resignationDate
      ? { kind: 'after_resignation' as const, at: dayToMs(offer.resignationDate) + DAY_MS }
      : null,
    offer.startDate
      ? { kind: 'week_before_start' as const, at: dayToMs(offer.startDate) - 7 * DAY_MS }
      : null,
    offer.startDate
      ? { kind: 'day_after_start' as const, at: dayToMs(offer.startDate) + DAY_MS }
      : null,
  ]
    .filter(
      (c): c is NonNullable<typeof c> =>
        c !== null && c.at >= today && (after === undefined || c.at > after.getTime()),
    )
    .sort((a, b) => a.at - b.at);
  const next = candidates[0];
  return next ? { kind: next.kind, dueAt: new Date(next.at) } : null;
}
