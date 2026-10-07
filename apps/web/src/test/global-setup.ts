// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Redis } from 'ioredis';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { TEST_DATABASE_ADMIN_URL, TEST_REDIS_URL } from './db-env';

declare module 'vitest' {
  export interface ProvidedContext {
    dbAvailable: boolean;
    redisAvailable: boolean;
  }
}

/**
 * Applies migrations to the test database once per run. When the database is unreachable the
 * database tests are skipped locally; with REQUIRE_DB=1 (CI) the run fails instead.
 */
async function redisReachable(): Promise<boolean> {
  const redis = new Redis(TEST_REDIS_URL, {
    lazyConnect: true,
    retryStrategy: () => null,
    maxRetriesPerRequest: 0,
  });
  redis.on('error', () => undefined);
  try {
    await redis.connect();
    await redis.ping();
    return true;
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}

export default async function setup(project: TestProject) {
  const redisAvailable = await redisReachable();
  if (!redisAvailable && process.env.REQUIRE_DB === '1') {
    throw new Error('REQUIRE_DB=1 but Redis is unreachable at ' + TEST_REDIS_URL);
  }
  if (!redisAvailable)
    console.warn('[tests] Redis unreachable; queue and realtime tests will be skipped');
  project.provide('redisAvailable', redisAvailable);

  const client = new pg.Client({ connectionString: TEST_DATABASE_ADMIN_URL });
  try {
    await client.connect();
    await client.end();
  } catch (error) {
    if (process.env.REQUIRE_DB === '1') {
      throw new Error(
        `REQUIRE_DB=1 but the test database is unreachable: ${(error as Error).message}`,
      );
    }
    console.warn(
      '[tests] test database unreachable; database tests will be skipped (run pnpm db:setup)',
    );
    project.provide('dbAvailable', false);
    return;
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_ADMIN_URL: TEST_DATABASE_ADMIN_URL },
    stdio: 'pipe',
  });
  project.provide('dbAvailable', true);
}
