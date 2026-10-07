// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminClient, dbAvailable } from '@/test/db';

/**
 * Guard (T-F-10, ADR-001): every table with an "agencyId" column has RLS enabled AND forced plus the
 * `agency_isolation` policy, so a table cannot ship without isolation. The two platform tables are
 * the only exemptions; the allowlist itself is checked so it cannot go stale.
 */
const PLATFORM_TABLES_WITHOUT_RLS = ['JobRun', 'PlatformAuditLog'];

describe.skipIf(!dbAvailable())('RLS guard (database)', () => {
  let admin: pg.Client;
  beforeAll(async () => {
    admin = await adminClient();
  });
  afterAll(() => admin.end());

  async function tenantTables(): Promise<string[]> {
    const { rows } = await admin.query<{ table_name: string }>(
      `SELECT c.table_name FROM information_schema.columns c
       JOIN information_schema.tables t USING (table_schema, table_name)
       WHERE c.table_schema = 'public' AND c.column_name = 'agencyId' AND t.table_type = 'BASE TABLE'
       ORDER BY 1`,
    );
    return rows.map((r) => r.table_name);
  }

  it('finds tenant tables (sanity)', async () => {
    expect((await tenantTables()).length).toBeGreaterThan(30);
  });

  it('enables and forces RLS on every tenant table', async () => {
    const tables = (await tenantTables()).filter((t) => !PLATFORM_TABLES_WITHOUT_RLS.includes(t));
    const { rows } = await admin.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`,
      [tables],
    );
    const byName = new Map(rows.map((r) => [r.relname, r]));
    const unprotected = tables.filter((t) => {
      const r = byName.get(t);
      return !r?.relrowsecurity || !r.relforcerowsecurity;
    });
    expect(unprotected).toEqual([]);
  });

  it('has the agency_isolation policy, fail-closed, on every tenant table', async () => {
    const tables = (await tenantTables()).filter((t) => !PLATFORM_TABLES_WITHOUT_RLS.includes(t));
    const { rows } = await admin.query<{
      tablename: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `SELECT tablename, qual, with_check FROM pg_policies
       WHERE schemaname = 'public' AND policyname = 'agency_isolation'`,
    );
    const byTable = new Map(rows.map((r) => [r.tablename, r]));
    const problems = tables.flatMap((t) => {
      const p = byTable.get(t);
      if (!p) return [`${t}: no agency_isolation policy`];
      const out: string[] = [];
      if (!p.qual?.includes('app.agency_id') || !p.qual.includes('NULLIF'))
        out.push(`${t}: USING must use NULLIF(current_setting('app.agency_id', true), '')`);
      if (!p.with_check?.includes('app.agency_id')) out.push(`${t}: missing WITH CHECK`);
      return out;
    });
    expect(problems).toEqual([]);
  });

  it('keeps the platform-table allowlist honest', async () => {
    const tables = await tenantTables();
    for (const t of PLATFORM_TABLES_WITHOUT_RLS) {
      expect(tables, `${t} no longer has agencyId; remove it from the allowlist`).toContain(t);
    }
    const { rows } = await admin.query<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relrowsecurity AND relname = ANY($1::text[])`,
      [PLATFORM_TABLES_WITHOUT_RLS],
    );
    expect(
      rows.map((r) => r.relname),
      'allowlisted table now has RLS; remove it from the allowlist',
    ).toEqual([]);
  });

  it('gives the runtime role no way around RLS', async () => {
    const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'easemuse_app'`,
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    const owned = await admin.query(
      `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'easemuse_app'`,
    );
    expect(owned.rowCount).toBe(0);
  });

  it('keeps migration bookkeeping away from the runtime role', async () => {
    const { rows } = await admin.query<{ ok: boolean }>(
      `SELECT has_table_privilege('easemuse_app', '"_prisma_migrations"', 'SELECT') AS ok`,
    );
    expect(rows[0]?.ok).toBe(false);
  });
});
