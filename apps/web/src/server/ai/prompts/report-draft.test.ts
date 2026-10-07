// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  NOT_CONFIRMED,
  REPORT_SECTIONS,
  submissionReportContentSchema,
  qualificationContentSchema,
} from '@easemuse/core';
import { missingSections, reportDraftPrompt, type ReportDraftInput } from './report-draft';

const base = (over: Partial<ReportDraftInput> = {}): ReportDraftInput => ({
  position: { title: 'Head of HR', location: 'Seoul' },
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
    ],
    education: [],
    coreSkills: ['Payroll'],
    technicalSkills: [],
    industryExperience: [],
    leadershipExperience: null,
    teamSize: '20',
    majorAchievements: [],
    location: 'Seoul',
  },
  analysis: {
    criteria: [{ key: 'coreCompetencies', level: 'strong', summary: 'Strong payroll depth' }],
    unmet: [],
    toConfirm: [],
  },
  qualification: qualificationContentSchema.parse({
    fields: { compensation: { value: '180-190k', confirmed: true } },
  }).fields,
  ...over,
});
const model = Object.fromEntries(REPORT_SECTIONS.map((k) => [k, `text ${k}`])) as never;

describe('submission report prompt (A16)', () => {
  it('asks only for the sections it has sources for', () => {
    const full = reportDraftPrompt.buildPrompt(base());
    expect(full.user).toContain('- compensation:');
    expect(full.user).toContain('- jdMatch:');
    const none = reportDraftPrompt.buildPrompt(base({ analysis: null, qualification: null }));
    expect(none.user).not.toContain('- compensation:');
    expect(none.user).not.toContain('- jdMatch:');
    expect(none.user).toContain('- overview:');
  });

  it('never asks for section 14 and keeps the name out', () => {
    const { system, user } = reportDraftPrompt.buildPrompt(base());
    expect(user).not.toMatch(/recruiterAssessment|assessment/i);
    expect(system).toContain('you do not write that');
    expect(system).toContain('Never write a name');
  });

  it('fills sections without a source with "Not yet confirmed", lists what is missing, and leaves section 14 empty', () => {
    const input = base({ qualification: null });
    expect(missingSections(input)).toEqual([
      'compensation',
      'location',
      'workAuthorization',
      'motivation',
      'interviewAvailability',
    ]);
    const content = submissionReportContentSchema.parse(reportDraftPrompt.toContent!(model, input));
    expect(content.compensation).toBe(NOT_CONFIRMED);
    expect(content.overview).toBe('text overview');
    expect(content.jdMatch).toBe('text jdMatch');
    expect(content.missingInputs).toEqual(['qualification']);
    expect(content.recruiterAssessment).toBe('');
  });
});
