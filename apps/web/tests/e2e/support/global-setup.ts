// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { E2E_DATABASE_ADMIN_URL } from './env';

/** Brings the test database up to date before the app starts (the same migrations as production). */
export default function globalSetup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '../../..'),
    env: { ...process.env, DATABASE_ADMIN_URL: E2E_DATABASE_ADMIN_URL },
    stdio: 'pipe',
  });
}
