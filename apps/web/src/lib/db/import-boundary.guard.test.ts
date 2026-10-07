// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (T-F-09, ADR-001): the unscoped Prisma client is imported only inside lib/db (and tests
 * that seed data through src/test). ESLint enforces the same rule; this test catches a disabled lint.
 */
const SRC = path.resolve(__dirname, '../..');
const ALLOWED = [path.join(SRC, 'lib', 'db'), path.join(SRC, 'test')];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('unscoped client import boundary', () => {
  const offenders = sourceFiles(SRC)
    .filter((f) => !ALLOWED.some((a) => f.startsWith(a + path.sep)))
    .filter((f) => {
      const text = readFileSync(f, 'utf8');
      const importsClientModule =
        /from\s+['"](?:@\/lib\/db\/client|(?:\.{1,2}\/)+(?:lib\/)?db\/client)['"]/.test(text);
      const valueImportOfPrisma = /^import\s+(?!type\b)[^;]*from\s+['"]@prisma\/client['"]/m.test(
        text,
      );
      return importsClientModule || valueImportOfPrisma;
    })
    .map((f) => path.relative(SRC, f));

  it('has no importers outside lib/db', () => {
    expect(offenders).toEqual([]);
  });
});
