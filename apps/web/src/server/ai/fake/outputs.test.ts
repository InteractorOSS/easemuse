// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  JD_SECTIONS,
  QUALIFICATION_TOPICS,
  filledHumanOnlyFields,
  outreachIncludeSchema,
  parseArtifactContent,
  qualificationContentSchema,
  type CandidateProfileContent,
  type MatchAnalysisContent,
} from '@easemuse/core';
import { createPromptRegistry, type PromptModule } from '../prompts';
import { registerBuiltInPrompts } from '../prompts/index';
import { PURPOSES, type PurposeId } from '../purposes';
import { fakeOutput } from './outputs';

/**
 * Every registered prompt module must have a fake answer that survives its schema, its `toContent`
 * and the artifact kind's content schema: otherwise AI_FAKE=on breaks that feature in development
 * and in the end-to-end test. Inputs mirror what the services pass (and the modules' own tests).
 */

// Fixed ids: the fake must be deterministic, and toContent maps them back.
const CANDIDATE_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
];
const POSITION_IDS = [
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
];

const RESUME = [
  'Alex Kim',
  'alex.kim@example.com | +82 10 1234 5678',
  'Senior HR Director at Northwind 2019-present',
  'Led a team of 12 across payroll and benefits.',
  'HR Manager at Acme 2014-2019',
  'Cut payroll errors by 40% with a Workday rollout.',
  'BA Business, State University',
  'Skills: payroll, compliance, recruiting',
].join('\n');

const JD_TEXT =
  'We need a Go engineer to own our payments backend.\nYou must have 5+ years of backend experience.\nKubernetes experience is a plus.\nRemote OK. No agencies.';

const sections = Object.fromEntries(
  JD_SECTIONS.map((s) => [
    s,
    s === 'compensation' || s === 'work_authorization'
      ? { status: 'missing', summary: '' }
      : { status: 'found', summary: `about ${s}` },
  ]),
);

const successProfile = {
  summary: 'A senior HR leader',
  criteria: [
    { id: 'c-must', text: 'Payroll leadership', category: 'must_have', basis: 'jd' },
    { id: 'c-nice', text: 'Korean language', category: 'nice_to_have', basis: 'jd' },
    { id: 'c-dq', text: 'Currently at a competitor', category: 'disqualifying', basis: 'intake' },
  ],
  expectations: { sixMonths: 'Own payroll', twelveMonths: '' },
  keyChallenges: ['Reduce errors'],
} as const;

const candidate: Omit<
  CandidateProfileContent,
  'fullName' | 'email' | 'phone' | 'potentialMotivation' | 'potentialConcerns'
> = {
  currentPosition: { title: 'HR Director', company: 'Northwind' },
  careerHistory: [
    {
      company: 'Northwind',
      title: 'HR Director',
      start: '2019',
      end: null,
      current: true,
      summary: 'Managed a team of 20 across payroll and benefits.',
    },
    {
      company: 'Acme',
      title: 'HR Manager',
      start: '2014',
      end: '2019',
      current: false,
      summary: 'Ran payroll.',
    },
  ],
  education: [{ school: 'State University', degree: 'BA Business', year: '2010' }],
  coreSkills: ['payroll', 'compliance'],
  industryExperience: ['manufacturing'],
  technicalSkills: ['Workday'],
  leadershipExperience: 'Led a 20-person team',
  teamSize: '20',
  careerProgression: null,
  location: 'Seoul',
  workAuthorization: 'No visa needed',
  compensationExpectation: 'KRW 120M',
  majorAchievements: [{ text: 'Cut payroll errors by 40%', evidence: [{ type: 'inferred' }] }],
};

const position = { title: 'Head of HR', location: 'Seoul' };

/** One realistic input per purpose. A registered purpose missing here fails the test below. */
const INPUTS: Partial<Record<PurposeId, unknown>> = {
  'jd.structure': {
    jdText: JD_TEXT,
    position: { title: 'Backend Engineer', location: 'Seoul', requiredSkills: ['Go', 'Rust'] },
  },
  'intake.questions': {
    structuredJd: {
      sections,
      requirements: [
        { id: 'r1', section: 'technical_skills', text: 'Go', category: 'must_have', quote: '' },
      ],
    },
    position,
  },
  'success_profile.create': {
    structuredJd: {
      sections,
      requirements: [
        {
          id: 'r1',
          section: 'technical_skills',
          text: 'Payroll',
          category: 'must_have',
          quote: '',
        },
      ],
    },
    intake: {
      exclusions: {
        value: 'No one from a direct competitor',
        source: 'recruiter',
        status: 'accepted',
      },
      key_challenges: { value: 'Payroll errors', source: 'recruiter', status: 'accepted' },
      expected_results: { value: 'A clean audit', source: 'recruiter', status: 'accepted' },
    },
    position,
  },
  'search_criteria.create': {
    profile: {
      ...successProfile,
      criteria: [
        { id: 'c1', text: 'Go, 5+ years', category: 'must_have', basis: 'jd' },
        { id: 'c2', text: 'Worked at a competitor', category: 'disqualifying', basis: 'intake' },
      ],
    },
    position: { title: 'Senior Backend Engineer', location: 'Seoul' },
  },
  'profile.structure': { sourceText: RESUME, source: 'resume' },
  'feedback.structure': {
    email:
      'Hi team, strong technical skills and clear communication. Leadership is limited for this level. Thanks',
    fromRole: 'hm',
    position: { title: 'HR Director' },
  },
  'pattern.summarize': {
    facts: [
      {
        id: 'F1',
        question: 'interviewProfiles',
        label: 'Put forward from a referral and interviewed',
        n: 3,
        hits: 2,
        rate: null,
        small: true,
        refs: [],
        refCount: 0,
      },
    ],
    context: {
      clientId: '00000000-0000-4000-8000-000000000001',
      clientName: 'Northwind',
      asOf: '2026-10-08',
      records: 3,
      positions: 1,
      withheld: 0,
    },
  },
  'match.analyze': {
    successProfile,
    candidate,
    position: { ...position, workArrangement: 'hybrid', compensation: '100-130M KRW' },
  },
  'outreach.draft': {
    touchNumber: 1,
    channel: 'text',
    include: outreachIncludeSchema.parse({}),
    successProfile,
    candidate: { ...candidate, achievements: ['Cut payroll errors by 40%'] },
    position: { ...position, workArrangement: 'hybrid', compensation: null },
    earlier: [],
  },
  'call.questions': {
    position,
    mustHaves: ['Payroll leadership'],
    toConfirm: ['Notice period', 'Team size managed'],
  },
  'notes.qualify': {
    notes: 'Very keen. Wants more scope. Salary 180-190k. 30 days notice. Boss may counter.',
    position: { title: 'Head of HR' },
  },
  'resume.tailor': {
    position,
    successProfile,
    profile: candidate,
    header: { name: 'Alex Kim', email: 'alex@x.com', phone: '010', location: 'Seoul' },
    blind: true,
  },
  'report.draft': {
    position,
    profile: candidate,
    analysis: {
      criteria: [
        { key: 'coreCompetencies', level: 'strong', summary: 'Strong payroll depth' },
        { key: 'careerLevel', level: 'partial', summary: 'Scope to confirm' },
      ],
      unmet: [],
      toConfirm: ['Notice period'],
    },
    qualification: qualificationContentSchema.parse({
      fields: { compensation: { value: '180-190k', confirmed: true } },
    }).fields,
  },
  'screening.prefill': { position, profile: candidate },
  'pool.similar': {
    generatedOn: '2026-10-07',
    basis: 'semantic',
    notIndexed: 0,
    poolSize: 10,
    alreadyInPosition: 0,
    position,
    successProfileText: 'Summary: A senior HR leader',
    candidates: [
      {
        ref: 'C1',
        candidateId: CANDIDATE_IDS[0],
        similarity: 0.8,
        text: 'Current position: HR Director at Northwind\nCore skills: payroll',
      },
      {
        ref: 'C2',
        candidateId: CANDIDATE_IDS[1],
        similarity: 0.6,
        text: 'Current position: Recruiter',
      },
    ],
  },
  'portfolio.check': {
    generatedOn: '2026-10-07',
    candidateText: 'Current position: HR Director at Northwind\nCore skills: payroll',
    positions: [
      {
        ref: 'P1',
        positionId: POSITION_IDS[0],
        title: 'HR Director',
        location: 'Seoul',
        profileText: 'payroll',
      },
      {
        ref: 'P2',
        positionId: POSITION_IDS[1],
        title: 'Backend Engineer',
        location: 'Seoul',
        profileText: 'Go',
      },
    ],
    notAssessed: [{ positionId: POSITION_IDS[2], why: 'no_success_profile' }],
    truncated: false,
  },
  'market.benchmark': {
    generatedOn: '2026-10-07',
    webSearchEnabled: false,
    position: {
      title: 'Backend Engineer',
      location: 'Seoul',
      department: null,
      workArrangement: null,
      compensation: null,
      requiredExperience: null,
      requiredSkills: ['Go'],
    },
    structuredJd: {
      sections: [{ section: 'technical_skills', summary: 'Go' }],
      requirements: [{ id: 'r1', section: 'technical_skills', text: 'Go', category: 'must_have' }],
    },
    ourData: [
      {
        id: 'O1',
        category: 'skill',
        text: 'Go was required in 3 of 3.',
        positionIds: [POSITION_IDS[0]],
      },
      {
        id: 'O2',
        category: 'compensation',
        text: 'Offers ranged from 90M to 120M KRW.',
        positionIds: [POSITION_IDS[1]],
      },
    ],
  },
  'factcheck.verify': {
    draft: 'Led a team of 12.',
    sources: [{ label: 'resume', text: RESUME }],
    alreadyFlagged: [],
  },
};

function registered(): { purpose: PurposeId; prompt: PromptModule }[] {
  const registry = createPromptRegistry();
  registerBuiltInPrompts(registry);
  return (Object.keys(PURPOSES) as PurposeId[]).flatMap((purpose) => {
    const prompt = registry.get(purpose);
    return prompt ? [{ purpose, prompt }] : [];
  });
}

/** Runs the pipeline the gateway runs after the model: schema, toContent, artifact content schema. */
function runPipeline(purpose: PurposeId, prompt: PromptModule, input: unknown) {
  const output = prompt.schema.parse(fakeOutput(purpose, input));
  const content = prompt.toContent
    ? prompt.toContent(output, input, null)
    : (output as Record<string, unknown>);
  const kind = PURPOSES[purpose].artifactKind;
  const stored = kind ? parseArtifactContent(kind, content) : content;
  return { output, content: stored, kind };
}

describe('fake model outputs', () => {
  const modules = registered();

  it('covers the registered prompt modules', () => {
    expect(modules.length).toBeGreaterThanOrEqual(16);
  });

  it.each(modules.map((m) => [m.purpose, m] as const))(
    '%s: passes the schema, toContent and the artifact content schema',
    (purpose, { prompt }) => {
      const input = INPUTS[purpose];
      expect(input, `add an input for ${purpose} to this test`).toBeDefined();
      const { content, kind } = runPipeline(purpose, prompt, input);
      if (kind) expect(filledHumanOnlyFields(kind, content)).toEqual([]);
      // Quotes are real substrings of the source, so no grounding step had to demote one.
      expect(JSON.stringify(content)).not.toMatch(/quoted words were not found/i);
      // The candidate's name and contact details never appear in an answer.
      expect(JSON.stringify(fakeOutput(purpose, input))).not.toMatch(/Alex Kim|alex[.@]/);
    },
  );

  it('is deterministic: the same input gives the same answer', () => {
    for (const { purpose } of modules)
      expect(fakeOutput(purpose, INPUTS[purpose])).toEqual(fakeOutput(purpose, INPUTS[purpose]));
  });

  it('throws for a purpose it has no answer for', () => {
    expect(() => fakeOutput('jd.improve', {})).toThrow(/jd\.improve/);
    expect(() => fakeOutput('toString', {})).toThrow(/toString/);
  });

  it('structures a resume from its text, with quotes kept and no identity fields', () => {
    const prompt = modules.find((m) => m.purpose === 'profile.structure')!.prompt;
    const { content } = runPipeline('profile.structure', prompt, INPUTS['profile.structure']);
    const profile = content as CandidateProfileContent;
    expect(profile).toMatchObject({ fullName: null, email: null, phone: null });
    expect(profile.currentPosition).toEqual({ title: 'Senior HR Director', company: 'Northwind' });
    expect(profile.careerHistory[0]).toMatchObject({ start: '2019', current: true });
    expect(profile.careerHistory[1]).toMatchObject({ company: 'Acme', end: '2019' });
    expect(profile.teamSize).toBe('12');
    expect(profile.technicalSkills).toContain('Workday');
    expect(profile.majorAchievements.length).toBeGreaterThan(0);
    for (const claim of profile.majorAchievements)
      expect(claim.evidence.every((e) => e.type === 'quote')).toBe(true);
  });

  it('takes the dated lines as jobs when a resume has a strengths section with job words', () => {
    const prompt = modules.find((m) => m.purpose === 'profile.structure')!.prompt;
    const sourceText = [
      '## Core Strengths',
      '**Strategic HR Business Partnering** — 5 years as an HRBP in SaaS companies.',
      '## Experience',
      '**Senior HR Business Partner, Marketing** | Bluefinch Software | 2023-02 – present',
      '**HR Coordinator** | Marlow Health Partners | 2016-07 – 2018-02',
    ].join('\n');
    const { content } = runPipeline('profile.structure', prompt, { sourceText, source: 'resume' });
    const profile = content as CandidateProfileContent;
    expect(profile.careerHistory).toEqual([
      expect.objectContaining({
        title: 'Senior HR Business Partner, Marketing',
        company: 'Bluefinch Software',
        start: '2023-02',
        current: true,
      }),
      expect.objectContaining({ title: 'HR Coordinator', start: '2016-07', end: '2018-02' }),
    ]);
  });

  it('answers every match criterion and every must-have and deal-breaker', () => {
    const prompt = modules.find((m) => m.purpose === 'match.analyze')!.prompt;
    const { content } = runPipeline('match.analyze', prompt, INPUTS['match.analyze']);
    const analysis = content as MatchAnalysisContent;
    expect(analysis.criteria).toHaveLength(7);
    expect(analysis.requirements.map((r) => r.criterionId)).toEqual(['c-must', 'c-dq']);
    expect(analysis.requirements.find((r) => r.criterionId === 'c-dq')!.status).toBe('unknown');
    expect(analysis.criteria.find((c) => c.key === 'locationArrangement')!.level).toBe('strong');
  });

  it('keeps every position and pool candidate the input named', () => {
    const pool = modules.find((m) => m.purpose === 'pool.similar')!.prompt;
    const similar = runPipeline('pool.similar', pool, INPUTS['pool.similar']).content as {
      items: { candidateId: string; reason: string }[];
    };
    expect(similar.items.map((i) => i.candidateId)).toEqual(CANDIDATE_IDS);
    expect(similar.items.every((i) => !/No summary was written/.test(i.reason))).toBe(true);

    const portfolio = modules.find((m) => m.purpose === 'portfolio.check')!.prompt;
    const fit = runPipeline('portfolio.check', portfolio, INPUTS['portfolio.check']).content as {
      items: { positionId: string; fit: string }[];
      notAssessed: { why: string }[];
    };
    expect(fit.items).toEqual([
      expect.objectContaining({ positionId: POSITION_IDS[0], fit: 'strong' }),
      expect.objectContaining({ positionId: POSITION_IDS[1], fit: 'low' }),
    ]);
    expect(fit.notAssessed.map((n) => n.why)).toEqual(['no_success_profile']);
  });

  it('keeps the benchmark suggestions without web research', () => {
    const prompt = modules.find((m) => m.purpose === 'market.benchmark')!.prompt;
    const report = runPipeline('market.benchmark', prompt, INPUTS['market.benchmark']).content as {
      webSearch: string;
      web: unknown[];
      suggestions: { basedOn: string[] }[];
      droppedWebItems: number;
    };
    expect(report).toMatchObject({ webSearch: 'off', web: [], droppedWebItems: 0 });
    expect(report.suggestions.map((s) => s.basedOn)).toEqual([['O1'], ['O2']]);
  });

  it('writes outreach within the channel limit, with placeholders instead of names', () => {
    const output = fakeOutput('outreach.draft', INPUTS['outreach.draft']) as { body: string };
    expect(output.body.length).toBeLessThanOrEqual(320);
    expect(output.body).toContain('{{first_name}}');
    expect(output.body).toContain('{{recruiter_name}}');
  });

  it('reads the call notes into fields, leaves the assessment and unmentioned topics empty', () => {
    const output = fakeOutput('notes.qualify', INPUTS['notes.qualify']) as {
      fields: Record<string, { value: string; level: string | null; inferred: boolean }>;
    };
    expect(Object.keys(output.fields)).toEqual([...QUALIFICATION_TOPICS]);
    expect(output.fields.interest).toMatchObject({ level: 'high', inferred: false });
    expect(output.fields.compensation!.value).toContain('180-190k');
    expect(output.fields.counterofferRisk).toMatchObject({ level: 'medium', inferred: true });
    expect(output.fields.workAuthorization!.value).toBe('');

    const report = modules.find((m) => m.purpose === 'report.draft')!.prompt;
    const content = runPipeline('report.draft', report, INPUTS['report.draft']).content;
    expect(content.recruiterAssessment).toBe('');
  });
});
