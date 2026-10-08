// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { importRequestSchema, parseCsv, rowFromCells, suggestMapping } from './csv-import';

describe('parseCsv', () => {
  it('reads quoted cells, doubled quotes, line breaks in quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['two\nlines', 'z'],
    ]);
  });

  it('drops a byte-order mark and blank lines, and keeps empty cells', () => {
    expect(parseCsv('﻿a,b,c\n\n1,,3\n,,\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('detects semicolons and tabs', () => {
    expect(parseCsv('이름;이메일\n김민수;minsu@x.kr')).toEqual([
      ['이름', '이메일'],
      ['김민수', 'minsu@x.kr'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('suggestMapping', () => {
  it('recognises common ATS and Korean headers, each field once', () => {
    expect(
      suggestMapping([
        'First Name',
        'Last Name',
        'E-mail',
        'Mobile Phone',
        'LinkedIn URL',
        'Tags',
        'Name',
        'Comments',
      ]),
    ).toEqual([
      'firstName',
      'lastName',
      'email',
      'phone',
      'profileUrl',
      'tags',
      'fullName',
      'notes',
    ]);
    expect(suggestMapping(['이름', '이메일', '전화번호', '회사', '경력', 'Whatever'])).toEqual([
      'fullName',
      'email',
      'phone',
      'currentCompany',
      'yearsExperience',
      null,
    ]);
  });

  it('does not map two columns to the same field', () => {
    expect(suggestMapping(['Email', 'Email Address'])).toEqual(['email', null]);
  });
});

describe('rowFromCells', () => {
  const mapping = suggestMapping(['First Name', 'Last Name', 'Email', 'Skills', 'Years', 'Tags']);
  it('joins first and last name, splits lists, reads years and lowercases tags', () => {
    const { row } = rowFromCells(
      ['Alex', 'Kim', 'alex@x.com', 'Payroll; Excel,Payroll', '12 years', 'VIP, Seoul'],
      mapping,
    );
    expect(row).toMatchObject({
      fullName: 'Alex Kim',
      email: 'alex@x.com',
      skills: ['Payroll', 'Excel'],
      yearsExperience: 12,
      tags: ['vip', 'seoul'],
    });
  });

  it('skips a line with no name', () => {
    expect(rowFromCells(['', '', 'a@x.com', '', '', ''], mapping)).toEqual({
      row: null,
      problem: 'noName',
    });
  });

  it('prefers a full-name column and uses the first value for a field mapped twice', () => {
    const { row } = rowFromCells(['Pat Lee', 'a@x.com', 'b@x.com'], ['fullName', 'email', 'email']);
    expect(row).toMatchObject({ fullName: 'Pat Lee', email: 'a@x.com' });
  });
});

describe('importRequestSchema', () => {
  it('needs a source and 1 to 100 rows with a name', () => {
    expect(importRequestSchema.safeParse({ source: 'linkedin', rows: [] }).success).toBe(false);
    expect(
      importRequestSchema.safeParse({ source: 'nowhere', rows: [{ fullName: 'A' }] }).success,
    ).toBe(false);
    expect(
      importRequestSchema.safeParse({ source: 'linkedin', rows: [{ fullName: '' }] }).success,
    ).toBe(false);
    expect(
      importRequestSchema.safeParse({ source: 'linkedin', rows: [{ fullName: 'A' }] }).success,
    ).toBe(true);
    const many = Array.from({ length: 101 }, () => ({ fullName: 'A' }));
    expect(importRequestSchema.safeParse({ source: 'linkedin', rows: many }).success).toBe(false);
  });
});
