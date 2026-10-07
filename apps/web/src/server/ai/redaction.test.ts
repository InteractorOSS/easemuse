// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  assertNoProtectedFields,
  containsProtectedField,
  isProtectedKey,
  redactStructured,
  redactText,
} from './redaction';

describe('redactStructured (FR-AI-09)', () => {
  it('drops protected fields at any depth and keeps job-related ones', () => {
    const profile = {
      fullName: 'Jane Doe',
      dateOfBirth: '1990-03-12',
      Gender: 'F',
      personal: { nationality: 'US', maritalStatus: 'single', phone: '555' },
      photoUrl: 'https://x.test/p.jpg',
      workAuthorization: 'US citizen',
      skills: ['Go', 'SQL'],
      history: [{ employer: 'Acme', title: 'Engineer', age: 33 }],
    };
    const { value, removed } = redactStructured(profile);
    expect(value).toEqual({
      fullName: 'Jane Doe',
      personal: { phone: '555' },
      workAuthorization: 'US citizen',
      skills: ['Go', 'SQL'],
      history: [{ employer: 'Acme', title: 'Engineer' }],
    });
    expect(removed.sort()).toEqual(['age', 'gender', 'marital_status', 'nationality', 'photo']);
  });

  it('matches key spellings regardless of case, spaces and punctuation', () => {
    for (const key of [
      'date_of_birth',
      'Date Of Birth',
      'DOB',
      'marital-status',
      'Profile Picture',
      'ETHNICITY',
      'Religion',
    ]) {
      expect(isProtectedKey(key), key).toBe(true);
    }
    for (const key of [
      'title',
      'employer',
      'workAuthorization',
      'yearsExperience',
      'location',
      'skills',
    ]) {
      expect(isProtectedKey(key), key).toBe(false);
    }
  });

  it('does not mutate its input', () => {
    const input = { age: 40, name: 'x' };
    redactStructured(input);
    expect(input).toEqual({ age: 40, name: 'x' });
  });

  it('guards prompt inputs', () => {
    expect(containsProtectedField({ nested: { gender: 'M' } })).toBe(true);
    expect(() => assertNoProtectedFields({ religion: 'x' }, 'match prompt')).toThrow(
      /match prompt contains protected fields: religion/,
    );
    expect(() => assertNoProtectedFields({ title: 'Engineer' })).not.toThrow();
  });
});

describe('redactText (FR-AI-09)', () => {
  const resume = [
    'Jane Doe',
    'Date of Birth: 12 March 1990',
    'Gender: Female',
    'Nationality: Canadian',
    'Marital Status: Married, 2 children',
    'Religion - none',
    'Photo: attached',
    '',
    'Experience',
    'Staff Engineer at Acme Corp, 2019 to 2024. Led a team of eight.',
    'Skills: TypeScript, Go, PostgreSQL',
  ].join('\n');

  it('removes labelled protected lines and keeps everything job-related', () => {
    const { value, removed } = redactText(resume);
    for (const gone of ['12 March 1990', 'Female', 'Canadian', 'Married', 'Religion', 'Photo'])
      expect(value).not.toContain(gone);
    expect(value).toContain('Staff Engineer at Acme Corp, 2019 to 2024');
    expect(value).toContain('Skills: TypeScript, Go, PostgreSQL');
    expect(value).toContain('Jane Doe');
    expect(removed.sort()).toEqual([
      'age',
      'gender',
      'marital_status',
      'nationality',
      'photo',
      'religion',
    ]);
  });

  it('removes photos embedded in the text', () => {
    const { value, removed } = redactText(
      'Intro ![me](data:image/png;base64,AAAA) text\nand ![x](photo.jpg)',
    );
    expect(value).not.toContain('base64');
    expect(value).not.toContain('photo.jpg');
    expect(removed).toEqual(['photo']);
  });

  it('removes inline age and birth phrases', () => {
    expect(redactText('A 34-year-old engineer, born on 5 May 1990, aged 34.').value).not.toMatch(
      /34|1990/,
    );
    expect(redactText('I was born in 1985 in Seoul').value).not.toContain('1985');
  });

  it('covers Korean labels', () => {
    const korean =
      '성명: 김민수\n생년월일: 1990.03.12\n성별: 남\n국적: 대한민국\n결혼: 기혼\n사진: 첨부\n경력: 네이버 시니어 엔지니어 2019-2024';
    const { value, removed } = redactText(korean);
    for (const gone of ['1990.03.12', '남', '대한민국', '기혼', '첨부'])
      expect(value).not.toContain(gone);
    expect(value).toContain('김민수');
    expect(value).toContain('네이버 시니어 엔지니어 2019-2024');
    expect(removed.sort()).toEqual(['age', 'gender', 'marital_status', 'nationality', 'photo']);
  });

  it('does not strip job facts that merely contain a trigger word', () => {
    const text =
      'Managed age verification systems.\nBuilt a gender-neutral hiring tool.\nSex education app, 2020 to 2021.\nDisabled accounts cleanup service';
    const { value } = redactText(text);
    expect(value).toContain('Managed age verification systems.');
    expect(value).toContain('gender-neutral hiring tool');
    expect(value).toContain('Disabled accounts cleanup service');
  });

  it('leaves text without protected content unchanged apart from trimming', () => {
    const { value, removed } = redactText('Senior Engineer\nBuilt things.');
    expect(value).toBe('Senior Engineer\nBuilt things.');
    expect(removed).toEqual([]);
  });
});
