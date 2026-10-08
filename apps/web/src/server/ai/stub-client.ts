// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { JD_SECTIONS, QUALIFICATION_TOPICS } from '@easemuse/core';
import { isE2eMode } from '@/lib/e2e-mode';
import type { ModelClient, ModelRequest, ModelResponse } from './anthropic';
import { sampleFromSchema } from './sample-from-schema';

/**
 * The model used by the end-to-end tests (T-QA-06): canned answers instead of a call to Anthropic,
 * so the whole product can be walked through quickly, for free and the same way every time. It can
 * only be built when `E2E_MODE=1` outside production, and the environment check refuses to start a
 * production process with that setting. Every answer is checked against the purpose's real schema,
 * so a schema change fails the test loudly instead of quietly returning stale data.
 */

type Answer = (request: ModelRequest<unknown>) => unknown;

const profile = {
  fullName: 'Alex Kim',
  email: 'alex.kim@example.com',
  phone: '+82 10 5555 0101',
  currentPosition: { title: 'HR Director', company: 'Northwind' },
  careerHistory: [
    {
      company: 'Northwind',
      title: 'HR Director',
      start: '2019',
      end: null,
      current: true,
      summary: 'Managed a team of 20 and ran payroll for 1,200 staff',
    },
    {
      company: 'Contoso',
      title: 'HR Manager',
      start: '2014',
      end: '2019',
      current: false,
      summary: 'Built the first people-analytics reports',
    },
  ],
  education: [{ school: 'Seoul National University', degree: 'BA Business', year: '2012' }],
  coreSkills: ['payroll', 'labour relations', 'people analytics'],
  industryExperience: ['manufacturing'],
  technicalSkills: ['Workday'],
  leadershipExperience: 'Leads an HR team of 20',
  teamSize: '20',
  careerProgression: 'Manager to Director in five years',
  location: 'Seoul',
  workAuthorization: null,
  compensationExpectation: null,
  potentialMotivation: null,
  majorAchievements: [],
  potentialConcerns: [],
};

const criterion = (key: string, level: string, score: number) => ({
  key,
  level,
  score,
  summary: 'Fits the role.',
  evidence: [{ type: 'inferred', rationale: 'Long tenure in a similar role' }],
  toConfirm: [],
});

/** What each purpose answers; anything not listed gets the smallest valid answer. */
const ANSWERS: Record<string, Answer> = {
  'jd.structure': () => ({
    sections: {
      ...Object.fromEntries(JD_SECTIONS.map((k) => [k, { status: 'missing', summary: '' }])),
      position_summary: {
        status: 'found',
        summary: 'Lead the HR function for a mid-size manufacturer.',
      },
      key_responsibilities: {
        status: 'found',
        summary: 'Run payroll, labour relations and people analytics.',
      },
      required_qualifications: {
        status: 'found',
        summary: '8+ years in HR, 3+ years leading a team.',
      },
      location: { status: 'found', summary: 'Seoul, hybrid.' },
    },
    requirements: [
      {
        section: 'required_qualifications',
        text: '8 or more years in HR',
        category: 'must_have',
        quote: '8+ years in HR',
      },
      {
        section: 'leadership_management',
        text: 'Leads a team of at least ten',
        category: 'preferred',
        quote: '',
      },
    ],
  }),
  'success_profile.create': () => ({
    summary: 'A senior HR leader who can run payroll and labour relations for a manufacturer.',
    criteria: [
      { text: '8 or more years in HR', category: 'must_have', basis: 'jd' },
      { text: 'Has led a team of ten or more', category: 'preferred', basis: 'jd' },
    ],
    expectations: { sixMonths: 'Knows the organisation', twelveMonths: 'Owns the people plan' },
    keyChallenges: ['Harmonise two payroll systems'],
  }),
  'profile.structure': () => profile,
  'match.analyze': () => ({
    criteria: [
      criterion('coreCompetencies', 'strong', 90),
      criterion('relevantExperience', 'strong', 85),
      criterion('industryFunctional', 'partial', 60),
      criterion('careerLevel', 'strong', 80),
      criterion('locationArrangement', 'strong', 90),
      criterion('educationCertification', 'strong', 100),
      criterion('compensationOther', 'unknown', 50),
    ],
    requirements: [],
  }),
  'outreach.draft': () => ({
    subject: 'A role we think fits you',
    body: 'Hi {{first_name}},\n\nYour work leading HR at a manufacturer caught our eye. We are hiring an HR Director in Seoul and would value a short call.\n\n{{recruiter_name}}',
  }),
  'call.questions': () => ({
    questions: [
      { topic: 'interest', question: 'What would make a move attractive to you?' },
      { topic: 'compensation', question: 'What range are you looking for?' },
    ],
  }),
  'notes.qualify': () => ({
    fields: {
      ...Object.fromEntries(
        QUALIFICATION_TOPICS.map((k) => [k, { value: '', level: null, inferred: false }]),
      ),
      interest: { value: 'Keen on the scope', level: 'high', inferred: false },
      availability: { value: '30 days notice', level: null, inferred: false },
    },
  }),
  'resume.tailor': () => ({
    summary: 'HR leader with payroll and labour-relations depth, leading a team of 20.',
    roles: [{ index: 1, bullets: ['Led an HR team of 20 across payroll and labour relations.'] }],
    skills: ['payroll', 'people analytics'],
  }),
  'report.draft': () => ({
    overview: 'A strong, experienced HR director who fits the brief.',
    currentPosition: 'HR Director at Northwind.',
    careerSummary: 'Manager to Director over ten years.',
    keyQualifications: 'Payroll, labour relations, people analytics.',
    achievements: 'Runs payroll for a large workforce.',
    jdMatch: 'Meets the essential requirement on years of HR experience.',
    recommendation: 'Recommend an interview.',
    concerns: 'The notice period still has to be confirmed.',
    compensation: 'To be confirmed with the candidate.',
    location: 'Seoul.',
    workAuthorization: 'Not stated.',
    motivation: 'Interested in the scope of the role.',
    interviewAvailability: 'Available on request.',
  }),
  'factcheck.verify': () => ({ unsupported: [] }),
};

/** Replaces the generated base with the canned answer where there is one. */
function answerFor(request: ModelRequest<unknown>): unknown {
  const canned = request.purpose ? ANSWERS[request.purpose] : undefined;
  const value = canned ? canned(request) : sampleFromSchema(request.schema);
  return request.schema.parse(value);
}

export function createStubModelClient(): ModelClient {
  if (!isE2eMode()) {
    throw new Error(
      'The stub model can only be used in end-to-end test mode (E2E_MODE=1, not in production)',
    );
  }
  return {
    async complete<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
      const parsed = answerFor(request as ModelRequest<unknown>) as T;
      // Stream the answer in pieces, as the real model would, so the screens that show a draft
      // being written are exercised too.
      const text = JSON.stringify(parsed);
      const step = Math.max(1, Math.ceil(text.length / 4));
      for (let at = 0; at < text.length; at += step) request.onDelta?.(text.slice(at, at + step));
      return {
        parsed,
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        stopReason: 'end_turn',
        latencyMs: 1,
      };
    },
  };
}
