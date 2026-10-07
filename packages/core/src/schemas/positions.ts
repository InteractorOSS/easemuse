// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { guardOverrideSchema } from './guards';
import { matchingWeightsSchema } from './settings';

export const POSITION_STATUSES = [
  'draft',
  'intake',
  'sourcing',
  'interviewing',
  'offer',
  'filled',
  'on_hold',
  'cancelled',
] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

/** The statuses a position can move to from each status (planning-handoff §3). `on_hold` also resumes to where it was. */
export const POSITION_TRANSITIONS: Record<PositionStatus, readonly PositionStatus[]> = {
  draft: ['intake', 'on_hold', 'cancelled'],
  intake: ['sourcing', 'on_hold', 'cancelled'],
  sourcing: ['interviewing', 'offer', 'on_hold', 'cancelled'],
  interviewing: ['sourcing', 'offer', 'on_hold', 'cancelled'],
  offer: ['interviewing', 'filled', 'on_hold', 'cancelled'],
  on_hold: ['draft', 'intake', 'sourcing', 'interviewing', 'offer', 'cancelled'],
  filled: [],
  cancelled: [],
};

/** Moves that need a recorded reason. */
export const REASON_REQUIRED: readonly PositionStatus[] = ['on_hold', 'cancelled'];

export const WORK_ARRANGEMENTS = ['onsite', 'hybrid', 'remote'] as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const money = z.number().min(0).max(1_000_000_000);

/** The §3.1 fields of `POST /positions`. Title, client and location are required. */
export const positionInputSchema = z
  .object({
    clientId: z.guid(),
    title: z.string().trim().min(2).max(160),
    location: z.string().trim().min(2).max(160),
    department: text(120),
    reportingLine: text(160),
    workArrangement: z.enum(WORK_ARRANGEMENTS).nullable().optional(),
    compMin: money.nullable().optional(),
    compMax: money.nullable().optional(),
    compCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code')
      .optional(),
    requiredExperience: text(500),
    requiredSkills: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    hiringTimeline: text(300),
    openings: z.number().int().min(1).max(500).optional(),
    workAuthorization: text(300),
    hiringManagerId: z.guid().nullable().optional(),
    /** Admins and leads may assign another member; recruiters always own what they create. */
    ownerId: z.guid().optional(),
    matchingWeights: matchingWeightsSchema.optional(),
  })
  .refine((v) => v.compMin == null || v.compMax == null || v.compMin <= v.compMax, {
    message: 'The minimum cannot be above the maximum',
    path: ['compMax'],
  });
export type PositionInput = z.infer<typeof positionInputSchema>;

/** `PATCH /positions/:id`: any subset, same rules. The client cannot change once created. */
export const positionPatchSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    location: z.string().trim().min(2).max(160),
    department: text(120),
    reportingLine: text(160),
    workArrangement: z.enum(WORK_ARRANGEMENTS).nullable(),
    compMin: money.nullable(),
    compMax: money.nullable(),
    compCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
    requiredExperience: text(500),
    requiredSkills: z.array(z.string().trim().min(1).max(60)).max(50),
    hiringTimeline: text(300),
    openings: z.number().int().min(1).max(500),
    workAuthorization: text(300),
    hiringManagerId: z.guid().nullable(),
    ownerId: z.guid(),
    matchingWeights: matchingWeightsSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type PositionPatch = z.infer<typeof positionPatchSchema>;

/** `POST /positions/:id/status`. */
export const positionStatusInputSchema = z.object({
  status: z.enum(POSITION_STATUSES),
  reason: z.string().trim().min(3).max(500).optional(),
  /** Go ahead despite a `warn` guard, with a reason for each (api-contracts: `overrideGuards`). */
  overrideGuards: z.array(guardOverrideSchema).max(8).optional(),
});
export type PositionStatusInput = z.infer<typeof positionStatusInputSchema>;

export const positionListFilterSchema = z.object({
  status: z.enum(POSITION_STATUSES).optional(),
  clientId: z.guid().optional(),
  ownerId: z.guid().optional(),
  q: z.string().trim().max(120).optional(),
});
