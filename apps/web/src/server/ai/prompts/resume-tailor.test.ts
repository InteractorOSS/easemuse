// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { tailoredResumeContentSchema } from '@easemuse/core';
import { resumeTailorPrompt, type ResumeTailorInput } from './resume-tailor';

const input = (blind = false): ResumeTailorInput => ({
  position: { title: 'Head of HR', location: 'Seoul' },
  successProfile: {
    summary: 'Lead HR for 800 people.',
    criteria: [{ id: 'c1', text: 'Led HR for 500+ staff', category: 'must_have', basis: 'jd' }],
    keyChallenges: [],
  },
  profile: {
    currentPosition: { title: 'HR Director', company: 'Northwind' },
    careerHistory: [
      {
        company: 'Northwind',
        title: 'HR Director',
        start: '2019',
        end: null,
        current: true,
        summary: 'Managed a team of 20',
      },
      {
        company: 'Acme',
        title: 'HR Manager',
        start: '2014',
        end: '2019',
        current: false,
        summary: 'Ran payroll',
      },
    ],
    education: [{ school: 'Seoul National University', degree: 'BA Psychology', year: '2012' }],
    coreSkills: ['Payroll', 'Recruiting'],
    technicalSkills: ['Workday'],
    industryExperience: ['Retail'],
    leadershipExperience: null,
    teamSize: '20',
    majorAchievements: [],
  },
  header: { name: 'Alex Kim', email: 'alex@x.com', phone: '010', location: 'Seoul' },
  blind,
});

describe('tailored resume prompt (A15)', () => {
  it('never puts the name or contact details in the prompt', () => {
    const { system, user } = resumeTailorPrompt.buildPrompt(input());
    expect(`${system}\n${user}`).not.toMatch(/Alex|alex@x\.com|010/);
    expect(user).toContain('Role 1: HR Director at Northwind');
  });

  it('copies employers, titles, dates and education from the profile, whatever the model says', () => {
    const out = {
      summary: 'HR leader.',
      roles: [{ index: 1, bullets: ['Led a team of 20'] }],
      skills: ['workday', 'Invented Skill', 'payroll'],
    };
    const content = tailoredResumeContentSchema.parse(resumeTailorPrompt.toContent!(out, input()));
    expect(content.roles.map((r) => [r.company, r.title, r.start, r.end, r.current])).toEqual([
      ['Northwind', 'HR Director', '2019', null, true],
      ['Acme', 'HR Manager', '2014', '2019', false],
    ]);
    expect(content.education).toEqual([
      { school: 'Seoul National University', degree: 'BA Psychology', year: '2012' },
    ]);
    // Only profile skills survive, in the model's order first.
    expect(content.skills).toEqual(['Workday', 'Payroll', 'Recruiting']);
    // A role the model left out keeps its original wording; the original is kept for the side-by-side view.
    expect(content.roles[1]).toMatchObject({ bullets: ['Ran payroll'], original: 'Ran payroll' });
    expect(content.roles[0]!.bullets).toEqual(['Led a team of 20']);
  });

  it('leaves the header empty for a blind resume', () => {
    const out = { summary: 's', roles: [], skills: [] };
    expect(
      tailoredResumeContentSchema.parse(resumeTailorPrompt.toContent!(out, input(true))).header,
    ).toEqual({
      name: null,
      email: null,
      phone: null,
      location: null,
    });
    expect(
      tailoredResumeContentSchema.parse(resumeTailorPrompt.toContent!(out, input(false))).header
        .name,
    ).toBe('Alex Kim');
  });
});
