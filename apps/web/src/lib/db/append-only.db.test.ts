// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, cleanup, createAgency, dbAvailable } from '@/test/db';

/**
 * Audit tables are append-only for the runtime role (T-0-03, ADR-016): it may read and add rows but
 * never change or remove them. The data-rights role may, because anonymizing a candidate redacts
 * personal data inside them. The tests switch role inside a transaction as the superuser.
 */
const AUDIT_TABLES = [
  'ActivityLog',
  'PipelineTransition',
  'PositionTransition',
  'LlmCall',
  'Approval',
  'Consent',
];

describe.skipIf(!dbAvailable())('append-only audit tables (T-0-03)', () => {
  let admin: pg.Client;
  let agency: string;

  /** Runs one statement as `role`, scoped to the agency, and rolls everything back. */
  const asRole = async (
    role: string,
    statement: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    await admin.query('BEGIN');
    try {
      await admin.query(`SET LOCAL ROLE ${role}`);
      await admin.query(`SELECT set_config('app.agency_id', $1, true)`, [agency]);
      await admin.query(statement);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    } finally {
      await admin.query('ROLLBACK');
    }
  };

  beforeAll(async () => {
    admin = await adminClient();
    agency = await createAgency(admin, 'Append only');
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
  });

  it.each(AUDIT_TABLES)('%s: the runtime role cannot update, delete or truncate', async (table) => {
    for (const statement of [
      `UPDATE "${table}" SET "agencyId" = "agencyId"`,
      `DELETE FROM "${table}"`,
      `TRUNCATE "${table}"`,
    ]) {
      const result = await asRole('easemuse_app', statement);
      expect(result.ok, statement).toBe(false);
      expect(result.error).toMatch(/permission denied/);
    }
    expect((await asRole('easemuse_app', `SELECT count(*) FROM "${table}"`)).ok).toBe(true);
  });

  it.each(AUDIT_TABLES)('%s: the data-rights role can update and delete', async (table) => {
    expect(
      (await asRole('easemuse_datarights', `UPDATE "${table}" SET "agencyId" = "agencyId"`)).ok,
    ).toBe(true);
    expect((await asRole('easemuse_datarights', `DELETE FROM "${table}"`)).ok).toBe(true);
  });

  it('still lets the runtime role append and change ordinary tables', async () => {
    const insert = await asRole(
      'easemuse_app',
      `INSERT INTO "ActivityLog" (id, "agencyId", "actorType", action, "entityType", "entityId") VALUES (gen_random_uuid(), '${agency}', 'system', 'test', 'x', gen_random_uuid())`,
    );
    expect(insert.ok).toBe(true);
    expect((await asRole('easemuse_app', `UPDATE "Task" SET "kind" = "kind"`)).ok).toBe(true);
  });

  it('keeps the data-rights role away from migration bookkeeping, and it has no BYPASSRLS', async () => {
    expect((await asRole('easemuse_datarights', `SELECT * FROM "_prisma_migrations"`)).ok).toBe(
      false,
    );
    const role = await admin.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'easemuse_datarights'`,
    );
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});
