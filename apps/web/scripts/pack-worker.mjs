// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Copies only the packages the bundled worker loads into a fresh directory for the worker image:
//   node scripts/pack-worker.mjs <deployDir> <outDir>
// <deployDir> is a `pnpm deploy --prod` tree holding dist/worker.mjs and the generated Prisma
// client. The web dependencies (Next.js and its compilers, TypeScript, Prisma Studio) are never
// loaded by the worker, so they stay out. Files are traced with @vercel/nft (the tracer behind
// Next.js standalone output), then widened to whole packages: nft cannot follow every import
// (unpdf's .mjs files fail to parse), and a whole package can't be missing a file it needs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [deployDir, outDir] = process.argv.slice(2).map((p) => path.resolve(p));
if (!deployDir || !outDir) throw new Error('usage: pack-worker.mjs <deployDir> <outDir>');

const require = createRequire(import.meta.url);
const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft');

const { fileList } = await nodeFileTrace([path.join(deployDir, 'dist/worker.mjs')], {
  base: deployDir,
});

/** `a/node_modules/.pnpm/x/node_modules/@s/pkg/lib/f.js` -> `.../node_modules/@s/pkg`. */
function packageRoot(file) {
  const match = /^(.*node_modules\/(?:@[^/]+\/[^/]+|[^/]+))(?:\/|$)/.exec(file);
  return match ? match[1] : file;
}

const roots = new Set([...fileList].map(packageRoot));
for (const rel of [...roots].sort()) {
  const from = path.join(deployDir, rel);
  const to = path.join(outDir, rel);
  if (fs.existsSync(to)) continue;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
}
console.log(`pack-worker: ${roots.size} entries from ${fileList.size} traced files -> ${outDir}`);
