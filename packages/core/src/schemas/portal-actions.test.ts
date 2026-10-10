// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { hmDecisionInputSchema } from './portal-actions';

describe('hmDecisionInputSchema', () => {
  it('lets a hiring manager propose an interview or an offer without a reason', () => {
    expect(hmDecisionInputSchema.safeParse({ decision: 'interview' }).success).toBe(true);
    expect(hmDecisionInputSchema.safeParse({ decision: 'offer' }).success).toBe(true);
  });

  it('asks for a reason on hold and reject', () => {
    expect(hmDecisionInputSchema.safeParse({ decision: 'hold' }).success).toBe(false);
    expect(hmDecisionInputSchema.safeParse({ decision: 'reject', reason: 'No fit' }).success).toBe(
      true,
    );
  });

  it('does not accept a decision that moves the pipeline itself', () => {
    expect(hmDecisionInputSchema.safeParse({ decision: 'accepted' }).success).toBe(false);
  });
});
