// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Bundles the BullMQ worker (src/worker/index.ts) into dist/worker.mjs for the container image, so
// production runs plain `node` instead of tsx. App code, `@/` aliases and the source-only workspace
// packages are bundled; every npm package stays external and is loaded from the production
// node_modules (Prisma's generated client, BullMQ's Lua scripts and playwright-core read files
// next to themselves).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Bare imports that are not ours resolve at runtime from node_modules. */
const externalizeNpmPackages = {
  name: 'externalize-npm-packages',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith('@/') || args.path.startsWith('@easemuse/')) return undefined;
      return { path: args.path, external: true };
    });
  },
};

await build({
  absWorkingDir: appDir,
  entryPoints: ['src/worker/index.ts'],
  outfile: 'dist/worker.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  plugins: [externalizeNpmPackages],
  // CommonJS dependencies bundled into an ES module still call require().
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
