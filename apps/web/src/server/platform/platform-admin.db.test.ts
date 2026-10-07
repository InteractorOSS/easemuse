// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlatformAdminActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { closeDb } from '@/lib/db';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { setAgencyBudget } from '@/server/tenancy/agencies';
import { listAuditEntries } from './audit-log';
import { recordPlatformAudit } from './audit';
import { getPlatformUsage, usageQuerySchema } from './usage';

describe.skipIf(!dbAvailable())('platform usage, audit log and budgets', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let adminUser: string;
  let actor: PlatformAdminActor;
  const agencies: string[] = [];
  const users: string[] = [];

  const call = (
    agencyId: string,
    purpose: string,
    model: string,
    cost: number,
    at: string,
    tokens = { i: 100, o: 50, c: 10 },
  ) =>
    appScope(handle).withAgency(agencyId, (tx) =>
      tx.llmCall.create({
        data: {
          agencyId,
          purpose,
          model,
          promptVersion: 'v1',
          inputTokens: tokens.i,
          outputTokens: tokens.o,
          cachedTokens: tokens.c,
          costUsd: cost,
          latencyMs: 5,
          createdAt: new Date(at),
        },
      }),
    );
  const query = (over: Record<string, unknown>) =>
    usageQuerySchema.parse({ from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z', ...over });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    handle = appHandle(3);
    agencyA = await createAgency(admin, 'Usage A');
    agencyB = await createAgency(admin, 'Usage B');
    adminUser = await createUser(admin);
    await admin.query(`UPDATE "User" SET email = 'platform.admin@example.test' WHERE id = $1`, [
      adminUser,
    ]);
    agencies.push(agencyA, agencyB);
    users.push(adminUser);
    actor = { kind: 'platform_admin', userId: adminUser, role: 'owner' };

    await call(agencyA, 'jd.structure', 'claude-opus-5-5', 0.5, '2026-09-10T10:00:00Z');
    await call(agencyA, 'jd.structure', 'claude-opus-5-5', 0.25, '2026-09-10T23:59:59Z');
    await call(agencyA, 'profile.structure', 'claude-sonnet-5-5', 0.1, '2026-09-11T00:00:01Z');
    await call(agencyA, 'jd.structure', 'claude-opus-5-5', 9, '2026-10-01T00:00:00Z'); // outside the range (to is exclusive)
    await call(agencyB, 'match.analyze', 'claude-opus-5-5', 2, '2026-09-20T12:00:00Z', {
      i: 1000,
      o: 500,
      c: 0,
    });
  });
  afterAll(async () => {
    await admin.query(`DELETE FROM "PlatformAuditLog" WHERE "adminId" = $1`, [adminUser]);
    await cleanup(admin, { agencies, users });
    await admin.end();
    await handle.close();
    await closeDb();
  });

  describe('usage (T-ADM-04)', () => {
    it('rolls up one agency by purpose with calls, tokens and cost', async () => {
      const rows = await getPlatformUsage(query({ agencyId: agencyA, groupBy: 'purpose' }));
      expect(rows).toEqual([
        {
          key: 'jd.structure',
          label: null,
          calls: 2,
          inputTokens: 200,
          outputTokens: 100,
          cachedTokens: 20,
          costUsd: 0.75,
        },
        {
          key: 'profile.structure',
          label: null,
          calls: 1,
          inputTokens: 100,
          outputTokens: 50,
          cachedTokens: 10,
          costUsd: 0.1,
        },
      ]);
    });

    it('groups by model and by UTC day, days in order, range end exclusive', async () => {
      const models = await getPlatformUsage(query({ agencyId: agencyA, groupBy: 'model' }));
      expect(models.map((r) => [r.key, r.costUsd])).toEqual([
        ['claude-opus-5-5', 0.75],
        ['claude-sonnet-5-5', 0.1],
      ]);
      const days = await getPlatformUsage(query({ agencyId: agencyA, groupBy: 'day' }));
      expect(days.map((r) => [r.key, r.calls, r.costUsd])).toEqual([
        ['2026-09-10', 2, 0.75],
        ['2026-09-11', 1, 0.1],
      ]);
    });

    it('groups across agencies with names, biggest spender first', async () => {
      const rows = await getPlatformUsage(query({ groupBy: 'agency' }));
      const mine = rows.filter((r) => r.key === agencyA || r.key === agencyB);
      expect(mine.map((r) => [r.label, r.costUsd, r.calls])).toEqual([
        ['Usage B', 2, 1],
        ['Usage A', 0.85, 3],
      ]);
      expect(rows.findIndex((r) => r.key === agencyB)).toBeLessThan(
        rows.findIndex((r) => r.key === agencyA),
      );
    });

    it('reports nothing for an agency with no usage in the range, and validates the range', async () => {
      expect(
        await getPlatformUsage(
          query({
            agencyId: agencyB,
            groupBy: 'purpose',
            from: '2026-01-01T00:00:00Z',
            to: '2026-02-01T00:00:00Z',
          }),
        ),
      ).toEqual([]);
      expect(usageQuerySchema.safeParse({ from: '2026-10-01', to: '2026-09-01' }).success).toBe(
        false,
      );
      expect(usageQuerySchema.safeParse({ from: '2024-01-01', to: '2026-01-01' }).success).toBe(
        false,
      );
      expect(usageQuerySchema.safeParse({ from: 'nope', to: '2026-01-01' }).success).toBe(false);
    });
  });

  describe('audit log (T-ADM-05)', () => {
    it('lists entries newest first with the admin email and agency name, filterable, in pages', async () => {
      for (const [i, action] of ['agency.create', 'agency.suspend', 'agency.budget'].entries()) {
        await appScope(handle).withAgency(agencyA, (tx) =>
          recordPlatformAudit(tx, {
            adminId: adminUser,
            action,
            agencyId: agencyA,
            targetType: 'agency',
            targetId: agencyA,
            data: { n: i },
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const all = await listAuditEntries({ limit: 10, adminId: adminUser });
      expect(all.items.map((e) => e.action)).toEqual([
        'agency.budget',
        'agency.suspend',
        'agency.create',
      ]);
      expect(all.items[0]).toMatchObject({
        adminEmail: 'platform.admin@example.test',
        agencyName: 'Usage A',
        targetType: 'agency',
      });
      expect(all.nextCursor).toBeNull();

      const page1 = await listAuditEntries({ limit: 2, adminId: adminUser });
      expect(page1.items).toHaveLength(2);
      const page2 = await listAuditEntries({
        limit: 2,
        adminId: adminUser,
        cursor: page1.nextCursor!,
      });
      expect(page2.items.map((e) => e.action)).toEqual(['agency.create']);

      expect(
        (await listAuditEntries({ limit: 10, adminId: adminUser, action: 'agency.su' })).items.map(
          (e) => e.action,
        ),
      ).toEqual(['agency.suspend']);
      expect(
        (await listAuditEntries({ limit: 10, adminId: adminUser, agencyId: agencyB })).items,
      ).toEqual([]);
      await expect(listAuditEntries({ limit: 10, cursor: 'bogus' })).rejects.toMatchObject({
        status: 422,
      });
    });
  });

  describe('budget (T-ADM-04)', () => {
    it('sets and clears the limit and records both changes', async () => {
      expect(await setAgencyBudget(agencyA, 250.5, actor)).toEqual({
        id: agencyA,
        aiMonthlyBudgetUsd: 250.5,
      });
      expect(await setAgencyBudget(agencyA, null, actor)).toEqual({
        id: agencyA,
        aiMonthlyBudgetUsd: null,
      });
      const audit = (
        await admin.query(
          `SELECT data FROM "PlatformAuditLog" WHERE action = 'agency.budget' AND "agencyId" = $1 AND "adminId" = $2 ORDER BY "createdAt"`,
          [agencyA, adminUser],
        )
      ).rows;
      expect(audit.map((r) => r.data)).toContainEqual({ from: null, to: 250.5 });
      expect(audit.map((r) => r.data)).toContainEqual({ from: 250.5, to: null });
    });

    it('404s for an unknown agency', async () => {
      await expect(setAgencyBudget(randomUUID(), 10, actor)).rejects.toMatchObject({ status: 404 });
    });
  });
});
