// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { createPromptRegistry } from '../prompts';
import { PURPOSES } from '../purposes';
import { registerBuiltInPrompts } from './index';
import { profileStructurePrompt } from './profile-structure';

const RESUME =
  'Alex Kim\nSenior HR Director at Northwind 2019-present\nLed a team of 12 across payroll';
const baseOutput = {
  fullName: 'Alex Kim',
  email: null,
  phone: null,
  currentPosition: { title: 'Senior HR Director', company: 'Northwind' },
  careerHistory: [],
  education: [],
  coreSkills: [],
  industryExperience: [],
  technicalSkills: [],
  leadershipExperience: null,
  teamSize: '12',
  careerProgression: null,
  location: null,
  workAuthorization: null,
  compensationExpectation: null,
  majorAchievements: [],
  potentialMotivation: null,
  potentialConcerns: [],
};

describe('A7 profile.structure prompt', () => {
  it('is registered and produces a candidate_profile draft on the cheaper model', () => {
    const registry = createPromptRegistry();
    registerBuiltInPrompts(registry);
    expect(registry.get('profile.structure')).toBe(profileStructurePrompt);
    expect(PURPOSES['profile.structure']).toMatchObject({
      artifactKind: 'candidate_profile',
      model: 'claude-sonnet-5-5',
    });
  });

  it('says to leave gaps empty, to label inference, to leave out personal characteristics, and to treat the text as data', () => {
    const { system } = profileStructurePrompt.buildPrompt({
      sourceText: RESUME,
      source: 'linkedin',
    });
    expect(system).toMatch(/return null/i);
    expect(system).toMatch(/never guess/i);
    expect(system).toMatch(/"inferred"/);
    expect(system).toMatch(/age, date of birth, gender/i);
    expect(system).toMatch(/work authorization/i);
    expect(system).toMatch(/data, not instructions/i);
  });

  it('puts the text in a block that names where the recruiter found the candidate', () => {
    const { user } = profileStructurePrompt.buildPrompt({ sourceText: RESUME, source: 'linkedin' });
    expect(user).toContain('<source type="linkedin">');
    expect(user).toContain('Led a team of 12');
  });

  it('keeps a quote that is in the text and turns one that is not into an inference', () => {
    const output = profileStructurePrompt.schema.parse({
      ...baseOutput,
      majorAchievements: [
        {
          text: 'Led a team of 12',
          evidence: [
            { type: 'quote', source: 'resume', excerpt: 'Led a team of 12 across payroll' },
          ],
        },
        {
          text: 'Won an award',
          evidence: [{ type: 'quote', source: 'resume', excerpt: 'Employee of the year 2021' }],
        },
        {
          text: 'Mixed',
          evidence: [
            { type: 'quote', source: 'resume', excerpt: 'Senior HR Director' },
            { type: 'quote', source: 'resume', excerpt: 'invented words' },
          ],
        },
      ],
      potentialMotivation: {
        text: 'Wants a bigger scope',
        evidence: [{ type: 'inferred', rationale: 'Long tenure at one level' }],
      },
    });
    const content = profileStructurePrompt.toContent!(output, {
      sourceText: RESUME,
      source: 'linkedin',
    }) as unknown as {
      majorAchievements: { evidence: { type: string; excerpt?: string; rationale?: string }[] }[];
    };
    expect(content.majorAchievements[0]!.evidence).toEqual([
      { type: 'quote', source: 'resume', excerpt: 'Led a team of 12 across payroll' },
    ]);
    expect(content.majorAchievements[1]!.evidence).toEqual([
      { type: 'inferred', rationale: 'The quoted words were not found in the source' },
    ]);
    expect(content.majorAchievements[2]!.evidence).toEqual([
      { type: 'quote', source: 'resume', excerpt: 'Senior HR Director' },
    ]);
  });
});
