// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (ADR-003, TR-005): portal reads come from published snapshots only. The portal API routes and
 * the portal read module may import the portal modules, the file download helper and shared
 * plumbing, but none of the recruiter-side modules that hold unpublished data.
 */
const SRC = path.resolve(__dirname, '../..');
const ALLOWED_SERVER = ['server/portal/', 'server/files/', 'server/tenancy/invites'];
const FORBIDDEN_SERVER = [
  'server/positions',
  'server/candidates',
  'server/pipeline',
  'server/matching',
  'server/outreach',
  'server/qualification',
  'server/resume',
  'server/submission',
  'server/screening',
  'server/interviews',
  'server/offers',
  'server/clients',
  'server/artifacts',
  'server/ai',
  'server/privacy',
  'server/tasks',
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? files(full)
      : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
        ? [full]
        : [];
  });
}

describe('portal import boundary', () => {
  const guarded = [
    ...files(path.join(SRC, 'app/api/portal')),
    path.join(SRC, 'server/portal/read.ts'),
    path.join(SRC, 'server/portal/authorize.ts'),
    ...['app/(portal-hm)', 'app/(portal-candidate)'].flatMap((d) => {
      try {
        return files(path.join(SRC, d));
      } catch {
        return [];
      }
    }),
  ].filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  });

  it('finds the portal files (sanity)', () => {
    expect(guarded.length).toBeGreaterThan(3);
  });

  it.each(guarded.map((f) => path.relative(SRC, f)))(
    '%s imports no recruiter-side module',
    (rel) => {
      const text = readFileSync(path.join(SRC, rel), 'utf8');
      const imports = [...text.matchAll(/from '@\/([^']+)'/g)].map((m) => m[1]!);
      const bad = imports.filter(
        (i) =>
          FORBIDDEN_SERVER.some((f) => i.startsWith(f)) &&
          !ALLOWED_SERVER.some((a) => i.startsWith(a)),
      );
      expect(bad).toEqual([]);
    },
  );
});
