// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** What a task is about; features create tasks of these kinds (outreach due, interviews, offers...). */
export const TASK_KINDS = [
  'outreach_due',
  'interview',
  'offer_milestone',
  'approval_received',
  'proposal',
  'privacy_request',
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_SCOPES = ['today', 'upcoming', 'all'] as const;
export type TaskScope = (typeof TASK_SCOPES)[number];

/** Longest a task can be snoozed in one go. */
export const MAX_SNOOZE_DAYS = 30;

/** `POST /tasks/:id/snooze`: hide the task until this moment. */
export const snoozeTaskInputSchema = z.object({ until: z.coerce.date() });
export type SnoozeTaskInput = z.infer<typeof snoozeTaskInputSchema>;
