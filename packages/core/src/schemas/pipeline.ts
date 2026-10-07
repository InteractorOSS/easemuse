// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { guardOverrideSchema } from './guards';

export const PIPELINE_STATES = [
  'sourced',
  'reviewed',
  'screened',
  'contacting',
  'no_response',
  'not_interested',
  'interested',
  'qualified',
  'resume_ready',
  'candidate_approved',
  'submitted',
  'client_rejected',
  'interviewing',
  'rejected',
  'on_hold',
  'offer',
  'declined',
  'accepted',
  'reneged',
  'started',
  'withdrawn',
  'closed',
] as const;
export type PipelineState = (typeof PIPELINE_STATES)[number];

/** States a candidate cannot leave (the end of that candidate's story in this position). */
export const TERMINAL_STATES: readonly PipelineState[] = [
  'client_rejected',
  'rejected',
  'declined',
  'reneged',
  'started',
  'withdrawn',
  'closed',
];

/** Forward moves from each state (planning-handoff section 3). Withdrawn and closed are reachable from any open state. */
const FORWARD: Record<PipelineState, readonly PipelineState[]> = {
  sourced: ['reviewed', 'screened'],
  reviewed: ['screened'],
  screened: ['contacting'],
  contacting: ['no_response', 'not_interested', 'interested'],
  no_response: ['contacting'],
  not_interested: ['contacting'],
  interested: ['qualified'],
  qualified: ['resume_ready'],
  resume_ready: ['candidate_approved'],
  candidate_approved: ['submitted'],
  submitted: ['client_rejected', 'interviewing'],
  client_rejected: [],
  interviewing: ['rejected', 'on_hold', 'offer'],
  rejected: [],
  on_hold: ['interviewing'],
  offer: ['declined', 'accepted'],
  declined: [],
  accepted: ['reneged', 'started'],
  reneged: [],
  started: [],
  withdrawn: [],
  closed: [],
};

export const PIPELINE_TRANSITIONS: Record<PipelineState, readonly PipelineState[]> =
  Object.fromEntries(
    PIPELINE_STATES.map((state) => [
      state,
      TERMINAL_STATES.includes(state) ? [] : [...FORWARD[state], 'withdrawn', 'closed'],
    ]),
  ) as unknown as Record<PipelineState, readonly PipelineState[]>;

/** Moves that need a reason from the agency's list (FR-IVW-02: drop-off analysis in brief section 14). */
export const REASON_CODE_REQUIRED: readonly PipelineState[] = [
  'not_interested',
  'client_rejected',
  'rejected',
  'declined',
  'withdrawn',
];
/** Moves that need a free-text reason. */
export const REASON_TEXT_REQUIRED: readonly PipelineState[] = ['on_hold', 'reneged', 'closed'];

/** `POST /pipeline/:entryId/transitions` (api-contracts): one recruiter action. */
export const pipelineTransitionInputSchema = z.object({
  to: z.enum(PIPELINE_STATES),
  reason: z.string().trim().min(3).max(500).optional(),
  reasonCode: z.string().trim().min(2).max(60).optional(),
  overrideGuards: z.array(guardOverrideSchema).max(8).optional(),
});
export type PipelineTransitionInput = z.infer<typeof pipelineTransitionInputSchema>;

/** `POST /positions/:id/candidates`: add a confirmed candidate to a position. */
export const addToPositionInputSchema = z.object({ candidateId: z.guid() });
export type AddToPositionInput = z.infer<typeof addToPositionInputSchema>;
