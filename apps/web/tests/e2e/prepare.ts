// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Redis } from 'ioredis';
import pg from 'pg';
import { E2E_ADMIN_URL, E2E_DB, E2E_POSTGRES_URL, E2E_REDIS_URL, IDS, SEED } from './support/env';

/**
 * Run by playwright.config.ts before the servers start. Builds a clean world for the run: a fresh database with every migration, one agency with one
 * admin recruiter and one client (with a contact), and an empty Redis database. The database is
 * dropped first, but only if its name is exactly the end-to-end one.
 */
async function prepare(): Promise<void> {
  if (!E2E_ADMIN_URL.endsWith(`/${E2E_DB}`)) {
    throw new Error(`Refusing to rebuild a database that is not ${E2E_DB}: ${E2E_ADMIN_URL}`);
  }
  const postgres = new pg.Client({ connectionString: E2E_POSTGRES_URL });
  await postgres.connect();
  await postgres.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [E2E_DB],
  );
  await postgres.query(`DROP DATABASE IF EXISTS ${E2E_DB}`);
  await postgres.query(`CREATE DATABASE ${E2E_DB}`);
  await postgres.end();

  const admin = new pg.Client({ connectionString: E2E_ADMIN_URL });
  await admin.connect();
  await admin.query('CREATE EXTENSION IF NOT EXISTS vector');
  await admin.end();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_ADMIN_URL: E2E_ADMIN_URL },
    stdio: 'pipe',
  });

  const db = new pg.Client({ connectionString: E2E_ADMIN_URL });
  await db.connect();
  const [agencyId, userId, clientId] = [IDS.agency, IDS.user, IDS.client];
  await db.query(
    `INSERT INTO "Agency" (id, slug, name, status, "updatedAt") VALUES ($1, $2, $3, 'active', now())`,
    [agencyId, SEED.agencySlug, SEED.agencyName],
  );
  await db.query(
    `INSERT INTO "User" (id, "interactorSubject", email, name, "updatedAt") VALUES ($1, $2, $3, $4, now())`,
    [userId, SEED.recruiterSubject, SEED.recruiterEmail, SEED.recruiterName],
  );
  await db.query(
    `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'admin'::"AgencyRole", true, now())`,
    [agencyId, userId],
  );
  await db.query(
    `INSERT INTO "Client" (id, "agencyId", name, "updatedAt") VALUES ($1, $2, $3, now())`,
    [clientId, agencyId, SEED.clientName],
  );
  await db.query(
    `INSERT INTO "ClientContact" (id, "agencyId", "clientId", name, email, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
    [agencyId, clientId, SEED.contactName, SEED.contactEmail],
  );
  await db.end();

  const redis = new Redis(E2E_REDIS_URL, { maxRetriesPerRequest: 1 });
  await redis.flushdb();
  redis.disconnect();
}

prepare().catch((error) => {
  console.error(error);
  process.exit(1);
});
