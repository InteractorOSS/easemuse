// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (T-AI-06, ADR-006, FR-AI-02): downstream features read APPROVED content only. Draft
 * versions are visible to the artifact module and to the review surfaces that show them with an
 * "AI draft" badge; everything else must go through `readApproved()`. This test fails when any other
 * source file touches the `ArtifactVersion` table directly.
 */
const SRC = path.resolve(__dirname, '../..');
const sep = path.sep;

const ALLOWED_DIRS = [
  path.join(SRC, 'server', 'artifacts'), // the lifecycle service itself
  path.join(SRC, 'app', 'api', 'v1', 'agencies', '[agencyId]', 'artifacts'), // review surface: editor API
  // Data rights export and delete every version of a candidate's artifacts, drafts included (ADR-016).
  path.join(SRC, 'server', 'privacy'),
  path.join(SRC, 'test'),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('read rule: drafts stay inside the artifact module and review surfaces', () => {
  const offenders = sourceFiles(SRC)
    .filter((file) => !ALLOWED_DIRS.some((dir) => file.startsWith(dir + sep)))
    .filter((file) => {
      const text = readFileSync(file, 'utf8');
      return (
        /\.artifactVersion\b/i.test(text) ||
        /["'`]ArtifactVersion["'`]/.test(text) ||
        /\bFROM\s+"?ArtifactVersion/i.test(text)
      );
    })
    .map((file) => path.relative(SRC, file));

  it('has no other readers of ArtifactVersion', () => {
    expect(offenders).toEqual([]);
  });

  it('actually scans the lifecycle service (sanity)', () => {
    const service = readFileSync(path.join(SRC, 'server', 'artifacts', 'service.ts'), 'utf8');
    expect(service).toMatch(/\.artifactVersion\b/);
  });
});
