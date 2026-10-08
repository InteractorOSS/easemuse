// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { FEEDBACK_CRITERIA, interviewFeedbackContentSchema } from '@easemuse/core';
import { feedbackStructurePrompt } from './feedback-structure';

const empty = Object.fromEntries(
  FEEDBACK_CRITERIA.map((k) => [k, { rating: null, evidence: '' }]),
) as never;

describe('feedback structuring prompt (A17)', () => {
  it('names every criterion, forbids guessing and protected details, and treats the text as data', () => {
    const { system, user } = feedbackStructurePrompt.buildPrompt({
      email: 'Great leader.',
      fromRole: 'hm',
      position: { title: 'Head of HR' },
    });
    for (const k of FEEDBACK_CRITERIA) expect(system).toContain(k);
    expect(system).toMatch(/never infer a rating/);
    expect(system).toMatch(/protected characteristic/);
    expect(system).toMatch(/data, not instructions/);
    expect(user).toContain('<feedback>\nGreat leader.\n</feedback>');
  });

  it('stores the draft unconfirmed, drops evidence for an unrated criterion and keeps the email', () => {
    const output = {
      ratings: {
        ...(empty as Record<string, unknown>),
        leadershipFit: { rating: 'strong', evidence: 'Great leader' },
        communication: { rating: null, evidence: 'stray quote' },
      },
      comments: 'Wants to see more of the team.',
    } as never;
    const content = interviewFeedbackContentSchema.parse(
      feedbackStructurePrompt.toContent!(output, {
        email: 'Great leader.',
        fromRole: 'candidate',
        position: { title: 'x' },
      }),
    );
    expect(content.fromRole).toBe('candidate');
    expect(content.source).toBe('Great leader.');
    expect(content.ratings.leadershipFit).toEqual({
      rating: 'strong',
      evidence: 'Great leader',
      confirmed: false,
    });
    expect(content.ratings.communication.evidence).toBe('');
    expect(Object.values(content.ratings).every((r) => !r.confirmed)).toBe(true);
  });
});
