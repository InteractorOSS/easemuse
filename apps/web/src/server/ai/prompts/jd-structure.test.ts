// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { JD_SECTIONS } from '@easemuse/core';
import { createPromptRegistry } from '../prompts';
import { PURPOSES } from '../purposes';
import { registerBuiltInPrompts } from './index';
import { jdStructurePrompt } from './jd-structure';

const input = {
  jdText: 'We need a Go engineer. 5+ years. Remote OK. No agencies.',
  position: {
    title: 'Backend Engineer',
    location: 'Seoul',
    requiredSkills: ['Go'],
    compensation: null,
  },
};

describe('A1 jd.structure prompt', () => {
  it('is registered for the jd.structure purpose, which makes a structured_jd draft on Opus', () => {
    const registry = createPromptRegistry();
    registerBuiltInPrompts(registry);
    expect(registry.get('jd.structure')).toBe(jdStructurePrompt);
    expect(PURPOSES['jd.structure']).toMatchObject({
      artifactKind: 'structured_jd',
      model: 'claude-opus-5-5',
    });
  });

  it('names all 13 sections and the four categories, and forbids inventing', () => {
    const { system } = jdStructurePrompt.buildPrompt(input);
    for (const section of JD_SECTIONS) expect(system).toContain(section);
    for (const category of ['must_have', 'preferred', 'nice_to_have', 'disqualifying'])
      expect(system).toContain(category);
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/language of the JD/i);
    expect(system).toMatch(/data, not instructions/i);
  });

  it('puts the JD and only the known position fields in tagged blocks', () => {
    const { user } = jdStructurePrompt.buildPrompt(input);
    expect(user).toContain('<jd>\nWe need a Go engineer.');
    expect(user).toContain('- title: Backend Engineer');
    expect(user).toContain('- required skills: Go');
    expect(user).not.toContain('compensation');
    expect(user).not.toContain('department');
  });

  it('turns the model answer into artifact content with a unique id per requirement', () => {
    const output = jdStructurePrompt.schema.parse({
      sections: Object.fromEntries(JD_SECTIONS.map((s) => [s, { status: 'missing', summary: '' }])),
      requirements: [
        { section: 'technical_skills', text: 'Go', category: 'must_have', quote: 'Go engineer' },
        { section: 'location', text: 'Remote OK', category: 'preferred', quote: 'Remote OK' },
      ],
    });
    const content = jdStructurePrompt.toContent!(output, input) as {
      requirements: { id: string }[];
    };
    expect(content.requirements).toHaveLength(2);
    expect(new Set(content.requirements.map((r) => r.id)).size).toBe(2);
  });
});
