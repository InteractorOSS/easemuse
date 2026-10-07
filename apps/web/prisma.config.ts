// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Local values live in the repo-root `.env.local`; real environment variables always win.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env.local'));
} catch {
  /* no local env file */
}

// Migrations run as the table OWNER (DATABASE_ADMIN_URL). The runtime role `easemuse_app`
// (DATABASE_URL) is not the owner and cannot bypass row-level security (ADR-001).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL! },
});
