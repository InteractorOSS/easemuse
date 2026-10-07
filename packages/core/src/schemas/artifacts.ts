// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { factCheckResolutionsInputSchema } from '../artifacts/fact-check';

/** `POST /artifacts/:id/versions`: a person's edit. Validated against the kind's schema server-side. */
export const saveVersionInputSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});
export type SaveVersionInput = z.infer<typeof saveVersionInputSchema>;

/** `POST /artifacts/:id/versions/:versionId/approve`. */
export const approveVersionInputSchema = z.object({
  factCheckResolutions: factCheckResolutionsInputSchema.optional(),
});
export type ApproveVersionInput = z.infer<typeof approveVersionInputSchema>;
