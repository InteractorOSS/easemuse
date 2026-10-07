// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: a client component ('use client') may import server code only as TYPES. A value import
 * from src/server or src/lib/db drags the database driver into the browser bundle, which fails the
 * production build ("Can't resolve 'fs'") only when someone finally runs it.
 */
const SRC = path.resolve(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const SERVER_ONLY =
  /^(?:@\/server\/|@\/lib\/db\b|@\/lib\/queue\b|@\/lib\/redis\b|@\/lib\/auth\/authorize|@\/lib\/auth['"]|@\/lib\/env\b|@\/worker\/)/;

describe('client components import server code as types only', () => {
  const offenders = files(SRC)
    .filter((file) =>
      /^\s*['"]use client['"]/m.test(readFileSync(file, 'utf8').split('\n').slice(0, 6).join('\n')),
    )
    .flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return [...text.matchAll(/^import\s+(?!type\b)([^;]*?)from\s+['"]([^'"]+)['"]/gms)]
        .filter(
          ([, clause, from]) =>
            SERVER_ONLY.test(from!) && !/^\s*\{\s*(?:type\s+\w+\s*,?\s*)+\}\s*$/.test(clause!),
        )
        .map(([, , from]) => `${path.relative(SRC, file)} imports ${from}`);
    });

  it('has no value imports of server modules in client files', () => {
    expect(offenders).toEqual([]);
  });

  it('actually finds the client files (sanity)', () => {
    const clientFiles = files(SRC).filter((f) =>
      /^\s*['"]use client['"]/m.test(readFileSync(f, 'utf8').split('\n').slice(0, 6).join('\n')),
    );
    expect(clientFiles.length).toBeGreaterThan(10);
  });
});
