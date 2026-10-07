// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseBranding, tailoredResumeContentSchema } from '@easemuse/core';
import { buildResumeDocx, roleRange } from './resume-docx';

const labels = {
  roles: 'Experience',
  education: 'Education',
  skills: 'Skills',
  present: 'present',
};
const content = (blind = false) =>
  tailoredResumeContentSchema.parse({
    blind,
    header: blind
      ? {}
      : { name: 'Alex Kim', email: 'alex@x.com', phone: '010-1234', location: 'Seoul' },
    headline: 'HR Director, Northwind',
    summary: 'HR leader.',
    roles: [
      {
        company: 'Northwind',
        title: 'HR Director',
        start: '2019',
        current: true,
        bullets: ['Led a team of 20'],
      },
    ],
    education: [{ school: 'SNU', degree: 'BA', year: '2012' }],
    skills: ['Payroll'],
  });

const textOf = async (bytes: Buffer) => {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file('word/document.xml')!.async('string');
};

describe('resume docx', () => {
  it('prints the role range with "present" for a current role', () => {
    expect(roleRange({ start: '2019', end: null, current: true }, 'present')).toBe(
      '2019 - present',
    );
    expect(roleRange({ start: '2014', end: '2019', current: false }, 'present')).toBe(
      '2014 - 2019',
    );
    expect(roleRange({ start: null, end: null, current: false }, 'present')).toBe('');
  });

  it('contains the identity, roles, education and skills', async () => {
    const xml = await textOf(
      await buildResumeDocx({ content: content(), branding: parseBranding(null), labels }),
    );
    for (const part of [
      'Alex Kim',
      'alex@x.com',
      'Led a team of 20',
      'Northwind',
      'BA, SNU, 2012',
      'Payroll',
      'Experience',
    ]) {
      expect(xml).toContain(part);
    }
  });

  it('leaves out the name and contact details of a blind resume', async () => {
    const xml = await textOf(
      await buildResumeDocx({ content: content(true), branding: parseBranding(null), labels }),
    );
    expect(xml).not.toMatch(/Alex Kim|alex@x\.com|010-1234/);
    expect(xml).toContain('Led a team of 20');
  });
});
