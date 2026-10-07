// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTIFACT_KINDS } from '@easemuse/core';

/** Guard (T-AI-07): the kind registry in packages/core and the Prisma enum list the same kinds. */
describe('artifact kinds match the database enum', () => {
  const schema = readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const block = /enum ArtifactKind \{([\s\S]*?)\}/.exec(schema)![1]!;
  const dbKinds = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));

  it('has the same kinds, in the same order', () => {
    expect(dbKinds).toEqual([...ARTIFACT_KINDS]);
  });
});
