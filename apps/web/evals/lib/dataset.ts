// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Root of the labelled evaluation data (T-QA-04). Override with `EVAL_DATA_DIR`. */
export const EVAL_DATA_DIR =
  process.env.EVAL_DATA_DIR ?? path.resolve(__dirname, '../../../../eval-data');

export interface JobDescription {
  id: string;
  title: string;
  company: string;
  location: string;
  hasCompRange: boolean;
  compRange: string | null;
  /** The JD text without the front matter. */
  text: string;
}

/** Reads `key: "value"` lines between `---` markers. Enough for the eval data's own format. */
export function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const kv = /^([\w]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!] = kv[2]!.replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: match[2]!.trim() };
}

export function loadJobDescription(id: string, dir = EVAL_DATA_DIR): JobDescription {
  const { meta, body } = parseFrontMatter(
    readFileSync(path.join(dir, 'job-descriptions', `${id}.md`), 'utf8'),
  );
  return {
    id,
    title: meta.title ?? id,
    company: meta.company ?? '',
    location: meta.location ?? '',
    hasCompRange: meta.has_comp_range === 'true',
    compRange: meta.comp_range ?? null,
    text: body,
  };
}

export type Level = 'strong' | 'partial' | 'gap' | 'unknown';

/** The answer key of one synthetic resume (see eval-data/resumes-synthetic/README.md). */
export interface ResumeKey {
  id: string;
  target_jd: string;
  intended_fit: 'strong' | 'partial' | 'weak';
  bias_pair: string | null;
  criteria: Record<string, { level: Level; why: string }>;
  must_haves: {
    requirement: string;
    status: 'met' | 'not_met' | 'unknown';
    evidence: string | null;
  }[];
  facts: {
    full_name: string;
    email: string;
    positions: {
      title: string;
      employer: string;
      start: string;
      end: string;
      team_size: number | null;
    }[];
    education: { degree: string; field: string; school: string; year: number }[];
    numbers: string[];
    work_authorization: string | null;
    compensation_expectation: string | null;
  };
}

export interface Resume {
  id: string;
  text: string;
  key: ResumeKey;
}

export function loadResume(id: string, dir = EVAL_DATA_DIR): Resume {
  const base = path.join(dir, 'resumes-synthetic');
  return {
    id,
    text: readFileSync(path.join(base, 'resumes', `${id}.md`), 'utf8'),
    key: JSON.parse(readFileSync(path.join(base, 'keys', `${id}.json`), 'utf8')) as ResumeKey,
  };
}

export function allResumeIds(dir = EVAL_DATA_DIR): string[] {
  const rows = readFileSync(path.join(dir, 'resumes-synthetic', 'manifest.csv'), 'utf8')
    .trim()
    .split('\n');
  return rows.slice(1).map((r) => r.split(',')[0]!);
}
