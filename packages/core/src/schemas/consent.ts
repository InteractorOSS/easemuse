// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { APPROVAL_METHODS } from './intake';

export const CONSENT_ACTIONS = ['given', 'withdrawn'] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

/** `POST /candidates/:id/consents` (FR-CDP-03, ADR-016): one more row, never an edit of an old one. */
export const recordConsentInputSchema = z.object({
  clientId: z.guid(),
  action: z.enum(CONSENT_ACTIONS),
  at: z.coerce.date(),
  method: z.enum(APPROVAL_METHODS),
});
export type RecordConsentInput = z.infer<typeof recordConsentInputSchema>;
