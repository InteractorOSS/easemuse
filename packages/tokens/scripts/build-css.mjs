// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Renders the design tokens to dist/theme.css (a Tailwind 4 @theme block). Node 24 strips the
// TypeScript types of the imported source itself, so no compiler step is needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensToTheme } from '../src/index.ts';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
mkdirSync(out, { recursive: true });
writeFileSync(
  path.join(out, 'theme.css'),
  `/* Generated from src/index.ts; do not edit. */\n${tokensToTheme()}`,
);
console.log('tokens: wrote dist/theme.css');
