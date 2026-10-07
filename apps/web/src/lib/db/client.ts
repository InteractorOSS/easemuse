// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// The UNSCOPED Prisma client. Importing this file outside `lib/db` is banned by ESLint
// (no-restricted-imports) and by a guard test: application code uses `withAgency()` (ADR-001).
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { getEnv } from '../env';
import { resolvePoolConfig, type PoolInput } from './pool-config';

export interface DbHandle {
  prisma: PrismaClient;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDbHandle(input: PoolInput): DbHandle {
  const pool = new pg.Pool(resolvePoolConfig(input));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    prisma,
    pool,
    async close() {
      await prisma.$disconnect();
      await pool.end().catch(() => undefined); // already ended by $disconnect on some adapters
    },
  };
}

const globalForDb = globalThis as unknown as { easemuseDb?: DbHandle };

/** Process-wide handle, built lazily from validated env (survives Next.js dev hot reloads). */
export function getDbHandle(): DbHandle {
  globalForDb.easemuseDb ??= (() => {
    const env = getEnv();
    return createDbHandle({
      connectionString: env.DATABASE_URL,
      role: env.PROCESS_ROLE,
      poolSize: env.DATABASE_POOL_SIZE,
      ssl: env.DATABASE_SSL === 'true',
    });
  })();
  return globalForDb.easemuseDb;
}
