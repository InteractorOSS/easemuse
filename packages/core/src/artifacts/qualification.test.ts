// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { QUALIFICATION_TOPICS } from './call-questions';
import { qualificationContentSchema, unconfirmedTopics } from './qualification';

describe('qualification content', () => {
  it('defaults every topic to empty and unconfirmed', () => {
    const c = qualificationContentSchema.parse({});
    expect(Object.keys(c.fields)).toEqual([...QUALIFICATION_TOPICS]);
    expect(c.fields.interest).toEqual({
      value: '',
      level: null,
      inferred: false,
      confirmed: false,
    });
    expect(unconfirmedTopics(c)).toEqual([]);
  });

  it('lists the filled fields the recruiter has not confirmed', () => {
    const c = qualificationContentSchema.parse({
      fields: {
        interest: { value: 'keen', level: 'high', confirmed: true },
        compensation: { value: '180-190k' },
        counterofferRisk: { level: 'medium', inferred: true },
      },
    });
    expect(unconfirmedTopics(c)).toEqual(['compensation', 'counterofferRisk']);
  });
});
