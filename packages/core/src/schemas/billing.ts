// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** `POST /api/admin/v1/agencies/:id/billing/plan`: the Billing Server plan id to put the agency on (US-1308). */
export const assignPlanInputSchema = z.object({
  planId: z.string().trim().min(1).max(100),
});
export type AssignPlanInput = z.infer<typeof assignPlanInputSchema>;
