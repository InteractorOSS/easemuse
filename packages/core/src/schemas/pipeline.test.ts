// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  PIPELINE_STATES,
  PIPELINE_TRANSITIONS,
  TERMINAL_STATES,
  pipelineTransitionInputSchema,
} from './pipeline';

describe('pipeline state map', () => {
  it('covers every state', () => {
    expect(Object.keys(PIPELINE_TRANSITIONS).sort()).toEqual([...PIPELINE_STATES].sort());
  });

  it('only ever leads to a known state', () => {
    for (const targets of Object.values(PIPELINE_TRANSITIONS))
      for (const to of targets) expect(PIPELINE_STATES).toContain(to);
  });

  it('gives terminal states no way out and every other state a way out', () => {
    for (const s of PIPELINE_STATES)
      expect(PIPELINE_TRANSITIONS[s].length === 0).toBe(TERMINAL_STATES.includes(s));
  });

  it('follows the happy path in order', () => {
    const path = [
      'sourced',
      'reviewed',
      'screened',
      'contacting',
      'interested',
      'qualified',
      'resume_ready',
      'candidate_approved',
      'submitted',
      'interviewing',
      'offer',
      'accepted',
      'started',
    ] as const;
    for (let i = 0; i < path.length - 1; i++)
      expect(PIPELINE_TRANSITIONS[path[i]!]).toContain(path[i + 1]);
  });

  it('does not let a candidate skip the submission steps', () => {
    expect(PIPELINE_TRANSITIONS.qualified).not.toContain('submitted');
    expect(PIPELINE_TRANSITIONS.resume_ready).not.toContain('submitted');
    expect(PIPELINE_TRANSITIONS.interested).not.toContain('candidate_approved');
    expect(PIPELINE_TRANSITIONS.interviewing).not.toContain('started');
  });

  it('lets any open state end in withdrawn or closed, and no finished one', () => {
    for (const s of PIPELINE_STATES.filter((x) => !TERMINAL_STATES.includes(x))) {
      expect(PIPELINE_TRANSITIONS[s]).toEqual(expect.arrayContaining(['withdrawn', 'closed']));
    }
    for (const s of TERMINAL_STATES) expect(PIPELINE_TRANSITIONS[s]).toEqual([]);
  });

  it('allows retrying outreach after no response or a no, and resuming after a hold', () => {
    expect(PIPELINE_TRANSITIONS.no_response).toContain('contacting');
    expect(PIPELINE_TRANSITIONS.not_interested).toContain('contacting');
    expect(PIPELINE_TRANSITIONS.on_hold).toContain('interviewing');
  });
});

describe('transition input', () => {
  it('needs a known target state', () => {
    expect(pipelineTransitionInputSchema.safeParse({ to: 'screened' }).success).toBe(true);
    expect(pipelineTransitionInputSchema.safeParse({ to: 'hired' }).success).toBe(false);
  });
  it('takes guard overrides with a reason each', () => {
    expect(
      pipelineTransitionInputSchema.safeParse({
        to: 'submitted',
        overrideGuards: [{ guard: 'consent', reason: 'Verbal consent on a call' }],
      }).success,
    ).toBe(true);
    expect(
      pipelineTransitionInputSchema.safeParse({
        to: 'submitted',
        overrideGuards: [{ guard: 'consent', reason: '' }],
      }).success,
    ).toBe(false);
  });
});
