// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ScopedTx } from '@/lib/db';
import type { DbHandle } from '@/lib/db/client';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { seedAgency, type SeededAgency } from '@/test/isolation-fixtures';
import { createProcessor } from './dispatcher';
import { JobRegistry, type JobContext } from './registry';

/**
 * Background-job isolation (T-QA-08, US-1301, ADR-001): a job runs in its own agency's context. A job
 * for agency A can neither read nor write agency B's data, and a job with no agency context cannot
 * touch tenant data at all (it fails closed).
 */
describe.skipIf(!dbAvailable())('background job isolation', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let a: SeededAgency;
  let b: SeededAgency;
  const agencies: string[] = [];
  const users: string[] = [];

  const jobFor = (agencyId: string | null, name = 'probe'): Job =>
    ({
      name,
      data: { jobRunId: randomUUID(), agencyId, requestedById: null, data: null },
      attemptsMade: 0,
      opts: { attempts: 1 },
      moveToDelayed: vi.fn(),
    }) as unknown as Job;

  /** Runs `probe` as a job of `queue` for `agencyId`; resolves with what the handler observed. */
  async function runAs<T>(
    queue: 'documents' | 'maintenance',
    agencyId: string | null,
    probe: (ctx: JobContext) => Promise<T>,
  ): Promise<T> {
    const registry = new JobRegistry();
    let observed: T | undefined;
    registry.register(queue, 'probe', async (ctx) => {
      observed = await probe(ctx);
    });
    const process = createProcessor(queue, {
      registry,
      updateJobRun: async () => undefined,
      getAgency: async (id) => ({ id, slug: id, name: id, status: 'active' }),
      withAgency: (id, fn) => appScope(handle).withAgency(id, fn),
      publishJobEvent: async () => undefined,
    });
    await process(jobFor(agencyId));
    return observed as T;
  }

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(3);
    const [agencyA, agencyB] = [
      await createAgency(admin, 'Job A'),
      await createAgency(admin, 'Job B'),
    ];
    const [userA, userB] = [await createUser(admin), await createUser(admin)];
    agencies.push(agencyA, agencyB);
    users.push(userA, userB);
    a = await seedAgency(appScope(handle), agencyA, userA, 'alpha');
    b = await seedAgency(appScope(handle), agencyB, userB, 'bravo');
  });
  afterAll(async () => {
    await cleanup(admin, { agencies, users });
    await admin.end();
    await handle.close();
  });

  it("a job for A reads only A's rows, in every table, never B's", async () => {
    const seen = await runAs('documents', a.agencyId, (ctx) =>
      ctx.withAgency(async (tx) => ({
        clients: await tx.client.findMany({ select: { agencyId: true } }),
        candidates: await tx.candidate.findMany({ select: { agencyId: true } }),
        versions: await tx.artifactVersion.findMany({ select: { agencyId: true } }),
        files: await tx.fileBlob.findMany({ select: { agencyId: true } }),
        ownB: await tx.client.findMany({ where: { agencyId: b.agencyId } }),
        ownBRaw: await tx.$queryRaw<
          unknown[]
        >`SELECT 1 FROM "Candidate" WHERE "agencyId" = ${b.agencyId}::uuid`,
      })),
    );
    for (const key of ['clients', 'candidates', 'versions', 'files'] as const) {
      expect(seen[key].length, key).toBeGreaterThan(0);
      expect(
        seen[key].every((r) => r.agencyId === a.agencyId),
        key,
      ).toBe(true);
    }
    expect(seen.ownB).toEqual([]);
    expect(seen.ownBRaw).toEqual([]);
  });

  it("a job for A cannot write into B, and B's rows are unchanged afterwards", async () => {
    const outcome = await runAs('documents', a.agencyId, async (ctx) => {
      const insert = await ctx
        .withAgency((tx) =>
          tx.client.create({ data: { agencyId: b.agencyId, name: 'planted by job' } }),
        )
        .then(
          () => 'inserted',
          () => 'refused',
        );
      const update = await ctx.withAgency((tx) =>
        tx.client.updateMany({ where: { id: b.clientId }, data: { name: 'hijacked' } }),
      );
      const remove = await ctx.withAgency((tx) =>
        tx.candidate.deleteMany({ where: { id: b.candidateId } }),
      );
      return { insert, update: update.count, remove: remove.count };
    });
    expect(outcome).toEqual({ insert: 'refused', update: 0, remove: 0 });
    const { rows } = await admin.query(
      `SELECT (SELECT name FROM "Client" WHERE id = $1) AS client, (SELECT count(*)::int FROM "Candidate" WHERE id = $2) AS candidate, (SELECT count(*)::int FROM "Client" WHERE name = 'planted by job') AS planted`,
      [b.clientId, b.candidateId],
    );
    expect(rows[0]).toEqual({ client: 'bravo client', candidate: 1, planted: 0 });
  });

  it('concurrent jobs for different agencies never see each other (shared connections)', async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const mine = i % 2 === 0 ? a : b;
        return runAs('documents', mine.agencyId, (ctx) =>
          ctx.withAgency(async (tx) => ({
            mine: mine.agencyId,
            rows: await tx.client.findMany({ select: { agencyId: true } }),
          })),
        );
      }),
    );
    for (const { mine, rows } of results) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.agencyId === mine)).toBe(true);
    }
  });

  it('a system job (no agency) cannot open an agency scope: it fails closed', async () => {
    const outcome = await runAs('maintenance', null, async (ctx) => {
      try {
        await ctx.withAgency(async (tx) => tx.client.findMany());
        return 'read something';
      } catch (error) {
        return (error as Error).message;
      }
    });
    expect(outcome).toMatch(/no agency context/i);
  });

  it('even a raw query with no context returns no tenant rows (missing context fails closed)', async () => {
    const rows = await handle.prisma.$queryRaw<
      { n: number }[]
    >`SELECT (SELECT count(*) FROM "Client") + (SELECT count(*) FROM "ArtifactVersion") + (SELECT count(*) FROM "FileBlob") AS n`;
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('a job whose agency is unknown or suspended never reaches the handler', async () => {
    const handler = vi.fn(async () => undefined);
    const registry = new JobRegistry().register('documents', 'probe', handler);
    const base = {
      registry,
      updateJobRun: async () => undefined,
      withAgency: <T>(id: string, fn: (tx: ScopedTx) => Promise<T>) =>
        appScope(handle).withAgency(id, fn),
      publishJobEvent: async () => undefined,
    };
    const missing = createProcessor('documents', { ...base, getAgency: async () => null });
    await expect(missing(jobFor(randomUUID()))).rejects.toThrow(/agency_not_found/);
    const suspended = createProcessor('documents', {
      ...base,
      getAgency: async (id) => ({ id, slug: 's', name: 'S', status: 'suspended' as const }),
    });
    await expect(suspended(jobFor(a.agencyId))).rejects.toThrow(/agency_suspended/);
    expect(handler).not.toHaveBeenCalled();
  });
});
