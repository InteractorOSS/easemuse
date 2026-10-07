// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyRoute } from '@/test/route-classification';

/** Guard (T-F-13, ADR-012): every API route is classified and uses the authorizer for its audience. */
const APP_DIR = path.resolve(__dirname, '..');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

describe('API route classification', () => {
  const files = routeFiles(path.join(APP_DIR, 'api'));

  it('finds the routes (sanity)', () => {
    expect(files.length).toBeGreaterThan(2);
  });

  it('classifies every route correctly', () => {
    const problems = files.flatMap((file) =>
      classifyRoute(
        path.relative(APP_DIR, file).replace(/\/route\.ts$/, ''),
        readFileSync(file, 'utf8'),
      ),
    );
    expect(problems).toEqual([]);
  });
});
