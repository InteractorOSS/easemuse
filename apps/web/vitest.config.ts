// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = { '@': path.resolve(__dirname, 'src') };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'evals/**/*.test.ts'],
          setupFiles: ['./src/test/setup-env.ts'],
          globalSetup: ['./src/test/global-setup.ts'],
          testTimeout: 30_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup-dom.ts'],
        },
      },
    ],
    coverage: { provider: 'v8', include: ['src/**'], exclude: ['src/generated/**', 'src/app/**'] },
  },
});
