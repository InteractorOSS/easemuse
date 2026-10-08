// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { outreachIncludeSchema } from '@easemuse/core';
import { outreachDraftPrompt, type OutreachDraftInput } from './outreach-draft';

const input = (over: Partial<OutreachDraftInput> = {}): OutreachDraftInput => ({
  touchNumber: 1,
  channel: 'email',
  include: outreachIncludeSchema.parse({ compensation: false }),
  successProfile: {
    summary: 'Lead the platform team.',
    criteria: [{ id: 'c1', text: '8 years of Go', category: 'must_have', basis: 'jd' }],
    keyChallenges: ['Migrate to Kubernetes'],
  },
  candidate: {
    currentPosition: { title: 'Staff Engineer', company: 'Acme' },
    coreSkills: ['Go'],
    industryExperience: ['Fintech'],
    leadershipExperience: null,
    careerProgression: null,
    location: 'Seoul',
    achievements: ['Cut deploy time by 60%'],
  },
  position: {
    title: 'Head of Platform',
    location: 'Seoul',
    workArrangement: 'hybrid',
    compensation: null,
  },
  client: { name: 'Northwind Corp', description: null },
  earlier: [],
  ...over,
});

describe('outreach draft prompt (A12)', () => {
  it('asks for placeholders and never carries a name', () => {
    const { system, user } = outreachDraftPrompt.buildPrompt(input());
    expect(system).toContain('{{first_name}}');
    expect(system).toContain('{{recruiter_name}}');
    expect(user).toContain('Maximum length: 1800');
    expect(user).toContain('Cut deploy time by 60%');
  });

  it('starts from a template when one is given, and says so in the rules', () => {
    const without = outreachDraftPrompt.buildPrompt(input());
    expect(without.user).not.toContain('<template');
    const { system, user } = outreachDraftPrompt.buildPrompt(
      input({ template: { name: 'Warm "intro"', body: 'Hi {{first_name}}, fixed opening.' } }),
    );
    expect(user).toContain(
      `<template name="Warm 'intro'">\nHi {{first_name}}, fixed opening.\n</template>`,
    );
    expect(system).toMatch(/start from it/);
    expect(system).toMatch(/Keep the placeholders exactly/);
    expect(outreachDraftPrompt.version).toBe('outreach-draft-v3');
  });

  it('gives the company name and description, and never invents a description', () => {
    const none = outreachDraftPrompt.buildPrompt(input()).user;
    expect(none).toContain('Company: Northwind Corp');
    expect(none).not.toContain('About the company');
    const withText = outreachDraftPrompt.buildPrompt(
      input({ client: { name: 'Northwind Corp', description: 'Payroll software' } }),
    ).user;
    expect(withText).toContain('About the company: Payroll software');
  });

  it('lists only the elements that are switched on', () => {
    const { user } = outreachDraftPrompt.buildPrompt(input());
    expect(user).toContain('- the main appeal of the role');
    expect(user).not.toContain('- compensation');
  });

  it('gives follow-ups what was said before', () => {
    const { user } = outreachDraftPrompt.buildPrompt(
      input({ touchNumber: 2, earlier: ['First note'] }),
    );
    expect(user).toContain('Touch 2');
    expect(user).toContain('First note');
  });

  it('keeps the channel and touch in the content, and the subject for email only', () => {
    const out = { subject: 'Hi', body: 'Body' };
    expect(outreachDraftPrompt.toContent!(out, input())).toEqual({
      channel: 'email',
      touchNumber: 1,
      subject: 'Hi',
      body: 'Body',
    });
    expect(outreachDraftPrompt.toContent!(out, input({ channel: 'text' }))).toMatchObject({
      subject: '',
    });
  });
});
