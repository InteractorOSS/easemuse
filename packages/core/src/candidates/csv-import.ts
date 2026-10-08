// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { CANDIDATE_SOURCES } from '../schemas/candidates';
import { tagSchema } from '../schemas/candidate-notes';

/**
 * CSV import of candidates from an ATS export or a spreadsheet (T-2-15, open question Q-10). The
 * file is read in the browser; the recruiter maps its columns to the fields below, and rows go to the
 * server in small batches. No AI is involved: the data is the agency's own.
 */

export const IMPORT_FIELDS = [
  'fullName',
  'firstName',
  'lastName',
  'email',
  'phone',
  'profileUrl',
  'currentTitle',
  'currentCompany',
  'location',
  'skills',
  'yearsExperience',
  'tags',
  'notes',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Largest file, most rows in the file, and rows per request. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const IMPORT_BATCH_SIZE = 100;

/**
 * Splits CSV text into rows of cells (RFC 4180: quoted cells, doubled quotes, line breaks inside
 * quotes). The delimiter is the most common of comma, semicolon and tab in the first line, since
 * spreadsheets in some locales save with semicolons. A byte-order mark is dropped; blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = ([',', ';', '\t'] as const)
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0]!.d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const normalize = (header: string) =>
  header
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Header names (normalised) that identify a field, English and Korean, as ATS exports write them. */
const SYNONYMS: Record<ImportField, string[]> = {
  fullName: [
    'name',
    'fullname',
    'candidatename',
    'candidate',
    'applicant',
    'applicantname',
    '이름',
    '성명',
    '후보자',
    '지원자',
  ],
  firstName: ['firstname', 'givenname', 'forename'],
  lastName: ['lastname', 'surname', 'familyname', '성'],
  email: ['email', 'emailaddress', 'mail', '이메일', '이메일주소'],
  phone: [
    'phone',
    'phonenumber',
    'mobile',
    'mobilephone',
    'cell',
    'telephone',
    'tel',
    '전화',
    '전화번호',
    '휴대폰',
    '연락처',
  ],
  profileUrl: [
    'linkedin',
    'linkedinurl',
    'profile',
    'profileurl',
    'url',
    'link',
    'website',
    '프로필',
  ],
  currentTitle: [
    'title',
    'jobtitle',
    'currenttitle',
    'position',
    'currentposition',
    'headline',
    '직함',
    '직책',
    '현직책',
  ],
  currentCompany: [
    'company',
    'currentcompany',
    'employer',
    'currentemployer',
    'organization',
    '회사',
    '현직장',
    '직장',
  ],
  location: ['location', 'city', 'address', 'region', 'country', '지역', '위치', '거주지'],
  skills: ['skills', 'skill', 'keywords', 'expertise', '스킬', '기술', '역량'],
  yearsExperience: [
    'years',
    'yearsofexperience',
    'experience',
    'yearsexperience',
    'totalexperience',
    'exp',
    '경력',
    '경력연수',
  ],
  tags: ['tags', 'tag', 'labels', 'label', 'categories', '태그'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'memo', '메모', '비고'],
};

/** A first guess at which field each column holds; `null` leaves it out. A field is suggested once. */
export function suggestMapping(headers: string[]): (ImportField | null)[] {
  const taken = new Set<ImportField>();
  return headers.map((header) => {
    const key = normalize(header);
    const field =
      IMPORT_FIELDS.find((f) => !taken.has(f) && SYNONYMS[f].some((s) => normalize(s) === key)) ??
      null;
    if (field) taken.add(field);
    return field;
  });
}

/** What one row of the import carries, after the mapping is applied. */
export const importRowSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().max(254).nullish(),
  phone: z.string().trim().max(40).nullish(),
  profileUrl: z.string().trim().max(500).nullish(),
  currentTitle: z.string().trim().max(160).nullish(),
  currentCompany: z.string().trim().max(160).nullish(),
  location: z.string().trim().max(160).nullish(),
  skills: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
  yearsExperience: z.number().int().min(0).max(60).nullish(),
  tags: z.array(tagSchema).max(20).default([]),
  notes: z.string().trim().max(4000).nullish(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

/** `POST /candidates/import`: one batch of rows from one file, all from the same source. */
export const importRequestSchema = z.object({
  source: z.enum(CANDIDATE_SOURCES),
  rows: z.array(importRowSchema).min(1).max(IMPORT_BATCH_SIZE),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

const list = (value: string) => [
  ...new Set(
    value
      .split(/[,;|\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

/**
 * Builds the row to send from one line of the file. Returns `null` for a line with no name, which
 * the page reports as skipped. First and last name columns are joined as "first last" when there is
 * no full-name column. A "5 years" style value gives the number; anything else leaves it empty.
 */
export function rowFromCells(
  cells: string[],
  mapping: (ImportField | null)[],
): { row: z.input<typeof importRowSchema> | null; problem: string | null } {
  const value: Partial<Record<ImportField, string>> = {};
  mapping.forEach((field, i) => {
    const cell = (cells[i] ?? '').trim();
    if (field && cell && value[field] === undefined) value[field] = cell;
  });
  const fullName =
    value.fullName ?? [value.firstName, value.lastName].filter(Boolean).join(' ').trim();
  if (!fullName) return { row: null, problem: 'noName' };
  const years = value.yearsExperience?.match(/\d+/);
  return {
    row: {
      fullName,
      email: value.email ?? null,
      phone: value.phone ?? null,
      profileUrl: value.profileUrl ?? null,
      currentTitle: value.currentTitle ?? null,
      currentCompany: value.currentCompany ?? null,
      location: value.location ?? null,
      skills: value.skills ? list(value.skills) : [],
      yearsExperience: years ? Math.min(60, Number(years[0])) : null,
      tags: value.tags ? list(value.tags).map((t) => t.toLowerCase().slice(0, 40)) : [],
      notes: value.notes ?? null,
    },
    problem: null,
  };
}

export type ImportOutcome =
  | { index: number; status: 'created'; candidateId: string }
  | { index: number; status: 'duplicate'; candidateId: string; reasons: string[] }
  | { index: number; status: 'invalid'; reason: string };
