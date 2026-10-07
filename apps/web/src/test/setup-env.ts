// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import path from 'node:path';

// Load the repo-root .env.local for tests when present; real env vars always win.
try {
  process.loadEnvFile(path.resolve(__dirname, '../../../../.env.local'));
} catch {
  /* no local env file: tests rely on defaults and explicit variables */
}
