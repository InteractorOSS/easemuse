// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PATTERN_DIMENSIONS } from '@easemuse/core';

/**
 * Guard (brief 14, NFR-AI04, FR-AI-09): the history reports and the A18 summary are built from facts
 * loaded in ONE place, which reads a short list of columns. This test reads that file and fails if
 * a name, a contact detail, a location, a comment, a reason text or any protected field is ever
 * selected there, so a later edit cannot quietly widen what the reports see. It also pins the
 * candidate fields the reports may group by to the allowed dimensions.
 */
const source = readFileSync(path.resolve(__dirname, 'facts.ts'), 'utf8');

/** Column names, as they would appear in a Prisma `select`, that must never be read for a report. */
const FORBIDDEN = [
  'fullName',
  'email',
  'phone',
  'profileUrl',
  'location',
  'tags',
  'currentTitle',
  'comments',
  'reason',
  'doNotContactReason',
  'dateOfBirth',
  'birthDate',
  'birthday',
  'age',
  'gender',
  'sex',
  'race',
  'ethnicity',
  'nationality',
  'religion',
  'disability',
  'maritalStatus',
  'photo',
  'note',
  'notes',
  'items',
  'answers',
  'extractedText',
  'searchText',
];

describe('the facts behind the reports', () => {
  it.each(FORBIDDEN)('never selects %s', (field) => {
    expect(source).not.toMatch(new RegExp(`\\b${field}\\s*:`));
  });

  it('reads exactly the job-related candidate fields', () => {
    const block = /candidate:\s*\{\s*select:\s*\{([^}]*)\}/.exec(source)![1]!;
    const fields = block
      .split(',')
      .map((f) => f.split(':')[0]!.trim())
      .filter(Boolean)
      .sort();
    expect(fields).toEqual(['seniority', 'skills', 'source', 'yearsExperience']);
    // and those are the fields the allowed dimensions are made of
    expect([...PATTERN_DIMENSIONS].sort()).toEqual(['experience', 'seniority', 'skill', 'source']);
  });
});
