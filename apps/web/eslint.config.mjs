// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

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
  {
    // Tenant isolation (ADR-001): the unscoped Prisma client may only be imported inside lib/db
    // and by tests of that module. Everything else uses withAgency().
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/db/**', 'src/test/**'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              allowTypeImports: true,
              group: ['@/lib/db/client', '**/lib/db/client', '@prisma/client'],
              message:
                'Use withAgency() from @/lib/db (ADR-001). The unscoped Prisma client is restricted to lib/db.',
            },
          ],
        },
      ],
    },
  },
]);
