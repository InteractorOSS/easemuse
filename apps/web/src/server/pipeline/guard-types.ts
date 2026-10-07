// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, GuardKey, PipelineState } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';

/** What a guard needs to decide whether a move may go ahead. */
export interface PipelineGuardContext {
  tx: ScopedTx;
  actor: AgencyActor;
  entry: { id: string; positionId: string; candidateId: string };
  from: PipelineState;
  to: PipelineState;
}

/** Returns what is missing, or null when the move is fine. */
export type PipelineGuard = (
  ctx: PipelineGuardContext,
) => Promise<{ guard: GuardKey; message: string } | null>;
