// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const PRISMA_PATTERN = {
  allowTypeImports: true,
  group: ['@/lib/db/client', '**/lib/db/client', '@prisma/client'],
  message:
    'Use withAgency() from @/lib/db (ADR-001). The unscoped Prisma client is restricted to lib/db.',
};
const AI_SDK_PATTERN = {
  allowTypeImports: true,
  group: ['@anthropic-ai/sdk', '@anthropic-ai/sdk/*'],
  message: 'Call models through the AI gateway in src/server/ai (ADR-004).',
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'src/generated/**']),
  {
    rules: {
      // UI copy goes through next-intl (ADR-015): no bare string literals in JSX.
      'react/jsx-no-literals': [
        'error',
        { noStrings: false, allowedStrings: ['·', '/', '—', '×'] },
      ],
    },
  },
  {
    files: ['**/*.test.tsx', 'tests/**'],
    rules: { 'react/jsx-no-literals': 'off' },
  },
  // Restricted imports. A rule's options are replaced, not merged, so each file set gets exactly the
  // patterns that apply to it:
  //   - ADR-001: the unscoped Prisma client is only for src/lib/db (and tests that seed data).
  //   - ADR-004: the AI SDK is only for src/server/ai (the gateway).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/db/**', 'src/test/**', 'src/server/ai/**'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [PRISMA_PATTERN, AI_SDK_PATTERN] },
      ],
    },
  },
  {
    files: ['src/lib/db/**/*.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [AI_SDK_PATTERN] }],
    },
  },
  {
    files: ['src/server/ai/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [PRISMA_PATTERN] }],
    },
  },
]);
