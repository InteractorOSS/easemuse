// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { checkAgainstSources, extractFacts, normaliseText } from './deterministic';

const SOURCE = [
  'Jane Doe',
  'Staff Engineer at Acme Corporation, 2019 to 2024. Led a team of 8 engineers building payments infrastructure.',
  'Reduced p95 checkout latency from 900 ms to 240 ms and cut infrastructure cost by 31 percent.',
  'Software Engineer at Globex, 2014 to 2019. Managed a $2,000,000 annual budget.',
  'Education: B.S. Computer Science, University of Washington, 2014.',
  'Skills: TypeScript, Go, PostgreSQL, Kubernetes.',
].join('\n');

const claims = (draft: string, sources = [SOURCE]) =>
  checkAgainstSources(draft, sources).map((w) => w.claim.split(':')[0]);

describe('extractFacts', () => {
  it('reads numbers, magnitudes and percentages in canonical form', () => {
    const keys = (t: string) =>
      extractFacts(t)
        .filter((f) => f.kind === 'number')
        .map((f) => f.key);
    expect(keys('Cut cost by 31 percent and 40%')).toEqual(['31%', '40%']);
    expect(keys('Managed $2,000,000, then 2M, then 2 million')).toEqual([
      '$2000000',
      '2000000',
      '2000000',
    ]);
    expect(keys('Grew 3.5x in 8 months')).toEqual(['3.5x', '8']);
  });

  it('treats plausible years separately and ignores list numbering', () => {
    const facts = extractFacts('1. Joined in 2019\n2) Left in 2024');
    expect(facts.filter((f) => f.kind === 'year').map((f) => f.key)).toEqual(['2019', '2024']);
    expect(facts.filter((f) => f.kind === 'number')).toEqual([]);
  });

  it('finds names and titles but not sentence openers, verbs or months', () => {
    const entities = (t: string) =>
      extractFacts(t)
        .filter((f) => f.kind === 'entity')
        .map((f) => f.text);
    expect(entities('Led Payments Infrastructure at Acme Corp in March.')).toEqual([
      'Payments Infrastructure',
      'Acme Corp',
    ]);
    expect(entities('Experience\nSkills')).toEqual([]);
    expect(entities('Built tools with TypeScript and PostgreSQL')).toEqual([
      'TypeScript',
      'PostgreSQL',
    ]);
    expect(entities('Studied at the University of Washington.')).toEqual([
      'University of Washington',
    ]);
  });
});

describe('normaliseText', () => {
  it('lowercases, drops punctuation and turns abbreviation dots into spaces', () => {
    expect(normaliseText('B.S. Computer  Science, “Acme”')).toBe('b s computer science acme');
    expect(normaliseText('Cost 3.5x')).toBe('cost 3.5x');
  });
});

describe('checkAgainstSources (T-AI-08)', () => {
  it('raises nothing for a faithful rewrite', () => {
    const draft =
      'Staff Engineer at Acme Corp (2019–2024). Led 8 engineers on payments infrastructure.\n' +
      'Cut infrastructure cost by 31%. Previously Software Engineer at Globex, 2014-2019, managing a $2M budget.\n' +
      'University of Washington, B.S. Computer Science. Skills: TypeScript, Go, PostgreSQL.';
    expect(checkAgainstSources(draft, [SOURCE])).toEqual([]);
  });

  it('flags a changed title, employer, dates, team size, savings and school', () => {
    const draft =
      'Chief Technology Officer at Initech (2021-2025). Led 40 engineers. Cut cost by 60%. Stanford University graduate.';
    const found = claims(draft);
    for (const expected of [
      'Chief Technology Officer',
      'Initech',
      '2021',
      '2025',
      '40',
      '60%',
      'Stanford University',
    ]) {
      expect(found, expected).toContain(expected);
    }
    expect(found).not.toContain('2019');
  });

  it('catches an inflated number even when the surrounding words are right', () => {
    expect(claims('Led 80 engineers at Acme Corp.')).toEqual(['80']);
    expect(claims('Led 8 engineers at Acme Corp.')).toEqual([]);
  });

  it('accepts text supported by ANY of several sources', () => {
    const notes = 'Candidate mentioned she also mentored 12 interns at Globex.';
    expect(claims('Mentored 12 interns at Globex.', [SOURCE])).toEqual(['12']);
    expect(claims('Mentored 12 interns at Globex.', [SOURCE, notes])).toEqual([]);
  });

  it('gives one warning per distinct fact, with stable ids and the sentence for context', () => {
    const draft = 'Led 99 people. Later led 99 people again.';
    const first = checkAgainstSources(draft, [SOURCE]);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      step: 'deterministic',
      claim: expect.stringContaining('Led 99 people'),
    });
    expect(checkAgainstSources(draft, [SOURCE])[0]!.id).toBe(first[0]!.id);
    expect(first[0]!.id).toMatch(/^det-[0-9a-f]{10}$/);
  });

  it('tolerates reordering and corp/corporation, but not a missing word', () => {
    expect(claims('Engineer, Staff at Acme Corp')).toEqual([]);
    expect(claims('Principal Engineer at Acme Corp')).toEqual(['Principal Engineer']);
  });

  it('returns nothing for text with no checkable facts', () => {
    expect(checkAgainstSources('built reliable systems and mentored teammates.', [SOURCE])).toEqual(
      [],
    );
    expect(checkAgainstSources('', [SOURCE])).toEqual([]);
  });
});
