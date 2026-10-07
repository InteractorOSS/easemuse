// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Adds or verifies the per-file license header.
//   node scripts/license-headers.mjs          add missing headers in place
//   node scripts/license-headers.mjs --check  exit 1 if any file lacks the exact header (CI)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HEADER = '// Copyright (c) 2026 Team of Wakers\n// SPDX-License-Identifier: MIT\n';

const ROOTS = ['apps/web/src', 'apps/web/prisma', 'apps/web/tests', 'packages', 'scripts'];
const ROOT_FILES = [
  'apps/web/next.config.ts',
  'apps/web/vitest.config.ts',
  'apps/web/playwright.config.ts',
  'apps/web/prisma.config.ts',
  'apps/web/eslint.config.mjs',
  'apps/web/postcss.config.mjs',
  'commitlint.config.cjs',
];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP = ['node_modules', '.next', 'dist', 'coverage', '.turbo', 'migrations', 'next-env.d.ts'];

async function walk(dir, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (EXTENSIONS.has(path.extname(e.name))) out.push(full);
  }
}

export function hasHeader(content) {
  const body = content.startsWith('#!') ? content.slice(content.indexOf('\n') + 1) : content;
  return body.startsWith(HEADER);
}

export function addHeader(content) {
  if (content.startsWith('#!')) {
    const i = content.indexOf('\n') + 1;
    return content.slice(0, i) + HEADER + content.slice(i);
  }
  return HEADER + content;
}

async function main() {
  const check = process.argv.includes('--check');
  const files = [];
  for (const r of ROOTS) await walk(path.join(REPO_ROOT, r), files);
  for (const f of ROOT_FILES) {
    try {
      await fs.access(path.join(REPO_ROOT, f));
      files.push(path.join(REPO_ROOT, f));
    } catch {
      /* optional */
    }
  }
  const missing = [];
  for (const f of files) {
    const content = await fs.readFile(f, 'utf8');
    if (hasHeader(content)) continue;
    missing.push(path.relative(REPO_ROOT, f));
    if (!check) await fs.writeFile(f, addHeader(content));
  }
  if (check && missing.length) {
    console.error(`Missing or wrong license header in ${missing.length} file(s):`);
    for (const m of missing) console.error(`  ${m}`);
    console.error('Run: pnpm lint:headers:fix');
    process.exit(1);
  }
  console.log(
    check ? `license headers ok (${files.length} files)` : `stamped ${missing.length} file(s)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
