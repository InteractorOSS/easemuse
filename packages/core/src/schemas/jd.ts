// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** `POST /positions/:id/jd` with pasted text instead of a file. */
export const jdTextInputSchema = z.object({ text: z.string().trim().min(50).max(200_000) });
export type JdTextInput = z.infer<typeof jdTextInputSchema>;

export const EXTRACTION_STATUSES = ['pending', 'ready', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];
