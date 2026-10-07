// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { GuardKey } from '@easemuse/core';
import { BUILT_IN_PIPELINE_GUARDS } from './guard-library';
import type { PipelineGuard, PipelineGuardContext } from './guard-types';

export type { PipelineGuard, PipelineGuardContext } from './guard-types';

const registry: PipelineGuard[] = [...BUILT_IN_PIPELINE_GUARDS];

/** Extra guards register here (the built-in ones are in guard-library.ts); the transition service asks every one on every move. */
export function registerPipelineGuard(guard: PipelineGuard): void {
  registry.push(guard);
}

export async function unsatisfiedGuards(
  ctx: PipelineGuardContext,
): Promise<{ guard: GuardKey; message: string }[]> {
  const found: { guard: GuardKey; message: string }[] = [];
  for (const guard of registry) {
    const result = await guard(ctx);
    if (result) found.push(result);
  }
  return found;
}
