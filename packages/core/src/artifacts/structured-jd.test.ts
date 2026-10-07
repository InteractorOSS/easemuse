// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  JD_SECTIONS,
  missingSections,
  parseArtifactContent,
  structuredJdContentSchema,
  structuredJdModelOutputSchema,
  type JdSection,
} from '..';

const sections = (missing: JdSection[] = []) =>
  Object.fromEntries(
    JD_SECTIONS.map((s) => [
      s,
      missing.includes(s) ? { status: 'missing', summary: '' } : { status: 'found', summary: 'x' },
    ]),
  );

describe('structured JD', () => {
  it('has the 13 sections of the brief', () => {
    expect(JD_SECTIONS).toHaveLength(13);
    expect(new Set(JD_SECTIONS).size).toBe(13);
  });

  it('requires every section, so a missing one must be said explicitly', () => {
    const partial = sections();
    delete (partial as Record<string, unknown>).compensation;
    expect(
      structuredJdModelOutputSchema.safeParse({ sections: partial, requirements: [] }).success,
    ).toBe(false);
    expect(
      structuredJdModelOutputSchema.safeParse({ sections: sections(), requirements: [] }).success,
    ).toBe(true);
  });

  it('gives each requirement exactly one valid category', () => {
    const base = {
      sections: sections(),
      requirements: [
        { section: 'technical_skills', text: 'Go', category: 'must_have', quote: 'Go required' },
      ],
    };
    expect(structuredJdModelOutputSchema.safeParse(base).success).toBe(true);
    const bad = { ...base, requirements: [{ ...base.requirements[0], category: 'critical' }] };
    expect(structuredJdModelOutputSchema.safeParse(bad).success).toBe(false);
    const twice = {
      ...base,
      requirements: [{ ...base.requirements[0], category: ['must_have', 'preferred'] }],
    };
    expect(structuredJdModelOutputSchema.safeParse(twice).success).toBe(false);
  });

  it('is the content schema of the structured_jd artifact kind, ids required', () => {
    const content = {
      sections: sections(),
      requirements: [{ id: 'r1', section: 'location', text: 'Seoul', category: 'preferred' }],
    };
    expect(structuredJdContentSchema.parse(content).requirements[0]!.quote).toBe('');
    expect(() => parseArtifactContent('structured_jd', content)).not.toThrow();
    expect(() => parseArtifactContent('structured_jd', { a: 1 })).toThrow();
    expect(() =>
      parseArtifactContent('structured_jd', {
        sections: sections(),
        requirements: [{ section: 'location', text: 'x', category: 'preferred' }],
      }),
    ).toThrow();
  });

  it('lists the sections the JD said nothing about', () => {
    const content = structuredJdContentSchema.parse({
      sections: sections(['compensation', 'work_authorization']),
      requirements: [],
    });
    expect(missingSections(content)).toEqual(['compensation', 'work_authorization']);
  });
});
