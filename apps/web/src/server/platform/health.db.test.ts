// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/db';
import { adminClient, cleanup, createAgency, createUser, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { getSystemHealth, healthQuerySchema } from './health';

const SECRET = 'jane.doe@secret-candidate.test wants 250k';

describe.skipIf(!dbAvailable())('system health (T-16-01, FR-ADM-09)', () => {
  let admin: pg.Client;
  let healthy: string;
  let troubled: string;
  let userId: string;
  const now = new Date();

  const job = (agencyId: string | null, status: string, key: string, minutesAgo = 5) =>
    admin.query(
      `INSERT INTO "JobRun" (id, "agencyId", queue, name, "idempotencyKey", status, error, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'ai', 'match.batch', $2, $3, $4, (now() at time zone 'utc') - ($5 || ' minutes')::interval, now())`,
      [agencyId, key, status, status === 'failed' ? SECRET : null, String(minutesAgo)],
    );
  const generation = (agencyId: string, status: string, error: string | null) =>
    admin.query(
      `INSERT INTO "AiGeneration" (id, "agencyId", purpose, "requestedById", "promptVersion", model, "inputRefs", status, error, "updatedAt")
       VALUES (gen_random_uuid(), $1, 'jd.structure', $2, 'v1', 'm', '{}', $3, $4, now())`,
      [agencyId, userId, status, error],
    );
  const mail = (agencyId: string, status: string, minutesAgo = 1) =>
    admin.query(
      `INSERT INTO "OutboxMessage" (id, "agencyId", "toAddress", subject, "bodyHtml", "bodyText", kind, transport, status, "lastError", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'jane.doe@secret-candidate.test', $4, '<p>x</p>', 'x', 'outreach', 'dev-capture', $2::"OutboxStatus", $4, (now() at time zone 'utc') - ($3 || ' minutes')::interval, now())`,
      [agencyId, status, String(minutesAgo), SECRET],
    );

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    healthy = await createAgency(admin, 'Health OK');
    troubled = await createAgency(admin, 'Health Bad');
    userId = await createUser(admin);
    // The healthy agency: successful work only.
    for (let i = 0; i < 6; i += 1) await generation(healthy, 'succeeded', null);
    await job(healthy, 'succeeded', 'h-1');
    await mail(healthy, 'sent');
    // The troubled one: failed jobs, failed and bounced and stuck mail, many errors and refusals.
    await job(troubled, 'failed', 't-1');
    await job(troubled, 'failed', 't-2', 90);
    await job(troubled, 'queued', 't-3', 120);
    await mail(troubled, 'failed');
    await mail(troubled, 'bounced');
    await mail(troubled, 'queued', 60);
    await mail(troubled, 'queued', 1);
    for (let i = 0; i < 4; i += 1) await generation(troubled, 'succeeded', null);
    for (let i = 0; i < 3; i += 1) await generation(troubled, 'failed', 'ai_unavailable');
    for (let i = 0; i < 3; i += 1) await generation(troubled, 'failed', 'ai_refused');
  });
  afterAll(async () => {
    await admin.query(`DELETE FROM "JobRun" WHERE "idempotencyKey" LIKE ANY(ARRAY['h-%', 't-%'])`);
    await cleanup(admin, { agencies: [healthy, troubled], users: [userId] });
    await admin.end();
    await closeDb();
  });

  it('counts failed jobs, failed, bounced and stuck mail, and AI errors and refusals per agency', async () => {
    const snapshot = await getSystemHealth({ hours: 24 }, now);
    const bad = snapshot.agencies.find((a) => a.agencyId === troubled)!;
    expect(bad).toMatchObject({
      jobsFailed: 2,
      outbox: { failed: 1, bounced: 1, stuck: 1 },
      ai: { generations: 10, errors: 3, refusals: 3 },
      needsAttention: true,
    });
    expect(bad.ai.errorRate).toBeCloseTo(0.3);
    expect(bad.ai.refusalRate).toBeCloseTo(0.3);
    const ok = snapshot.agencies.find((a) => a.agencyId === healthy)!;
    expect(ok).toMatchObject({
      jobsFailed: 0,
      outbox: { failed: 0, bounced: 0, stuck: 0 },
      ai: { generations: 6, errors: 0, refusals: 0 },
      needsAttention: false,
    });
  });

  it('lists the agencies that need attention first, and the failed jobs by id', async () => {
    const snapshot = await getSystemHealth({ hours: 24 }, now);
    const names = snapshot.agencies.map((a) => a.agencyName);
    expect(names.indexOf('Health Bad')).toBeLessThan(names.indexOf('Health OK'));
    expect(snapshot.failedJobs.filter((j) => j.agencyId === troubled)).toHaveLength(2);
    const ai = snapshot.queues.find((q) => q.queue === 'ai')!;
    expect(ai.queued).toBeGreaterThanOrEqual(1);
    expect(ai.failed).toBeGreaterThanOrEqual(2);
    expect(ai.oldestQueuedAt).toBeInstanceOf(Date);
  });

  it('respects the window: a shorter one leaves out older failures', async () => {
    const snapshot = await getSystemHealth({ hours: 1 }, now);
    expect(snapshot.agencies.find((a) => a.agencyId === troubled)!.jobsFailed).toBe(1);
  });

  it('never carries error text, subjects or addresses', async () => {
    const text = JSON.stringify(await getSystemHealth({ hours: 24 }, now));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('secret-candidate');
    expect(text).not.toContain('250k');
  });

  it('limits the window to 1 to 168 hours', () => {
    expect(healthQuerySchema.safeParse({ hours: 0 }).success).toBe(false);
    expect(healthQuerySchema.safeParse({ hours: 169 }).success).toBe(false);
    expect(healthQuerySchema.parse({}).hours).toBe(24);
  });
});
