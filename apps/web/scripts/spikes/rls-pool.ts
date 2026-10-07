// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// T-F-07 spike (risk TR-007): does RLS + Prisma interactive transactions + `set_config(..., true)`
// keep tenant context correct under pooled connections, and what does it cost?
//
//   TEST_DATABASE_ADMIN_URL=postgresql://$USER@localhost:5432/easemuse_test \
//   TEST_DATABASE_URL=postgresql://easemuse_app:easemuse_app@localhost:5432/easemuse_test \
//   pnpm --filter @easemuse/web exec tsx scripts/spikes/rls-pool.ts
//
// It only touches throwaway `rls_spike_*` tables in a database whose name ends in `_test`.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createDbHandle } from '../../src/lib/db/client';

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl || !appUrl) throw new Error('Set TEST_DATABASE_ADMIN_URL and TEST_DATABASE_URL');
if (!new URL(adminUrl).pathname.endsWith('_test'))
  throw new Error('Refusing: not a *_test database');

const ROWS_PER_AGENCY = 1_000;
const SEQUENTIAL_RUNS = 500;
const CONCURRENT_RUNS = 400;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function timeMany(
  n: number,
  fn: () => Promise<unknown>,
): Promise<{ p50: number; p95: number }> {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return { p50: percentile(times, 50), p95: percentile(times, 95) };
}

const fmt = (n: number) => `${n.toFixed(2)} ms`;

async function main() {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const agencyA = randomUUID();
  const agencyB = randomUUID();

  await admin.query(`
    DROP TABLE IF EXISTS rls_spike_plain, rls_spike_rls, rls_spike_naive;
    CREATE TABLE rls_spike_plain (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "agencyId" uuid NOT NULL, v int);
    CREATE TABLE rls_spike_rls   (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "agencyId" uuid NOT NULL, v int);
    CREATE TABLE rls_spike_naive (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "agencyId" uuid NOT NULL, v int);
    CREATE INDEX ON rls_spike_plain ("agencyId"); CREATE INDEX ON rls_spike_rls ("agencyId");
    ALTER TABLE rls_spike_rls ENABLE ROW LEVEL SECURITY; ALTER TABLE rls_spike_rls FORCE ROW LEVEL SECURITY;
    CREATE POLICY agency_isolation ON rls_spike_rls
      USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
      WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);
    ALTER TABLE rls_spike_naive ENABLE ROW LEVEL SECURITY; ALTER TABLE rls_spike_naive FORCE ROW LEVEL SECURITY;
    CREATE POLICY agency_isolation ON rls_spike_naive
      USING ("agencyId" = current_setting('app.agency_id', true)::uuid);
    GRANT SELECT, INSERT, UPDATE, DELETE ON rls_spike_plain, rls_spike_rls, rls_spike_naive TO easemuse_app;
  `);
  for (const table of ['rls_spike_plain', 'rls_spike_rls', 'rls_spike_naive']) {
    for (const agency of [agencyA, agencyB]) {
      await admin.query(
        `INSERT INTO ${table} ("agencyId", v) SELECT $1, g FROM generate_series(1, ${ROWS_PER_AGENCY}) g`,
        [agency],
      );
    }
  }

  const report: Record<string, unknown> = {};
  try {
    // 1) Correctness: two agencies, pool size 1, many concurrent transactions.
    const one = createDbHandle({ connectionString: appUrl!, role: 'web', poolSize: 1 });
    const scoped = (agency: string) =>
      one.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.agency_id', ${agency}, true)`;
        const rows = await tx.$queryRawUnsafe<{ agencyId: string }[]>(
          'SELECT "agencyId" FROM rls_spike_rls',
        );
        return { count: rows.length, foreign: rows.filter((r) => r.agencyId !== agency).length };
      });
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_RUNS }, (_, i) => scoped(i % 2 === 0 ? agencyA : agencyB)),
    );
    const leaks = results.filter((r) => r.foreign > 0 || r.count !== ROWS_PER_AGENCY).length;
    report.concurrentTransactionsOnPoolOf1 = { runs: CONCURRENT_RUNS, wrongResults: leaks };

    // 2) Fails closed: no context -> zero rows, including on a connection that ran a scoped tx before.
    const noContext = await one.prisma.$queryRawUnsafe<unknown[]>('SELECT 1 FROM rls_spike_rls');
    report.noContextRows = noContext.length;

    // 3) Gotcha: after a scoped tx the setting reads '' (not NULL) on that connection.
    //    A naive `current_setting(...)::uuid` policy then raises instead of returning zero rows.
    let naive = 'returned rows';
    try {
      await one.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.agency_id', ${agencyA}, true)`;
        await tx.$queryRawUnsafe('SELECT 1 FROM rls_spike_naive LIMIT 1');
      });
      await one.prisma.$queryRawUnsafe('SELECT 1 FROM rls_spike_naive');
    } catch (error) {
      const message = (error as Error).message;
      naive = `error: ${/invalid input syntax[^\n]*/i.exec(message)?.[0] ?? message.trim().slice(0, 200)}`;
    }
    report.naivePolicyAfterScopedTx = naive;
    await one.close();

    // 4) Overhead: plain query (no tx, no RLS) vs interactive tx + set_config + RLS query.
    const pool10 = createDbHandle({ connectionString: appUrl!, role: 'web', poolSize: 10 });
    const q = 'SELECT count(*)::int AS n FROM';
    await timeMany(50, () =>
      pool10.prisma.$queryRawUnsafe(`${q} rls_spike_plain WHERE "agencyId" = '${agencyA}'`),
    ); // warm up
    const plain = await timeMany(SEQUENTIAL_RUNS, () =>
      pool10.prisma.$queryRawUnsafe(`${q} rls_spike_plain WHERE "agencyId" = '${agencyA}'`),
    );
    const txOnly = await timeMany(SEQUENTIAL_RUNS, () =>
      pool10.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`${q} rls_spike_plain WHERE "agencyId" = '${agencyA}'`);
      }),
    );
    const scopedTx = await timeMany(SEQUENTIAL_RUNS, () =>
      pool10.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.agency_id', ${agencyA}, true)`;
        await tx.$queryRawUnsafe(`${q} rls_spike_rls`);
      }),
    );
    report.latency = {
      plainQuery: { p50: fmt(plain.p50), p95: fmt(plain.p95) },
      interactiveTxOnly: { p50: fmt(txOnly.p50), p95: fmt(txOnly.p95) },
      scopedTxWithRls: { p50: fmt(scopedTx.p50), p95: fmt(scopedTx.p95) },
      addedP95VsPlain: fmt(scopedTx.p95 - plain.p95),
    };
    await pool10.close();
  } finally {
    await admin.query('DROP TABLE IF EXISTS rls_spike_plain, rls_spike_rls, rls_spike_naive');
    await admin.end();
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
