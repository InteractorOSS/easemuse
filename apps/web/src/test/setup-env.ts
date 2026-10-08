// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import path from 'node:path';

// Load the repo-root .env.local for tests when present; real env vars always win.
try {
  process.loadEnvFile(path.resolve(__dirname, '../../../../.env.local'));
} catch {
  /* no local env file: tests rely on defaults and explicit variables */
}

// Code under test reads its configuration through getEnv(), which needs DATABASE_URL. Without a
// local env file (CI), point it at the test database (as db-env.ts does), never at a development one.
process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  'postgresql://easemuse_app:easemuse_app@localhost:5432/easemuse_test';
