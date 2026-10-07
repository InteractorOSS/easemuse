// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Fails if any circular import exists in the TypeScript sources (module boundaries stay honest).

import madge from 'madge';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TARGETS = ['apps/web/src', 'packages/core/src', 'packages/tokens/src'];

let failed = false;
for (const target of TARGETS) {
  const res = await madge(path.join(REPO_ROOT, target), {
    fileExtensions: ['ts', 'tsx'],
    tsConfig: path.join(REPO_ROOT, 'apps/web/tsconfig.json'),
    detectiveOptions: { ts: { skipTypeImports: true } },
  });
  const cycles = res.circular();
  if (cycles.length) {
    failed = true;
    console.error(`Import cycles in ${target}:`);
    for (const c of cycles) console.error(`  ${c.join(' -> ')}`);
  }
}
if (failed) process.exit(1);
console.log('no import cycles');
