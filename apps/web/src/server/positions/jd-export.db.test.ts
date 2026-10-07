// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import mammoth from 'mammoth';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
  redisAvailable,
} from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { approveStructuredJd, structuredJdContent } from '@/test/jd-fixtures';
import { exportDocx, getPdfStatus, startPdfExport } from './jd-export';
import { createPosition } from './service';

describe.skipIf(!dbAvailable())('improved JD export (T-1-12)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let owner: AgencyActor;
  let other: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  let clientId: string;
  const newPosition = async () =>
    (
      await run((tx) =>
        createPosition(tx, owner, { clientId, title: 'Staff Engineer', location: 'Seoul' }),
      )
    ).id;
  const text = async (bytes: Buffer) => (await mammoth.extractRawText({ buffer: bytes })).value;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL; // the export service uses the process-wide handle
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Export A');
    await admin.query(
      `UPDATE "Agency" SET branding = '{"displayName":"Acme Search","primaryColor":"#123456"}'::jsonb WHERE id = $1`,
      [agencyId],
    );
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyId, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, owner, { name: 'Northwind' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('refuses to export until the structured JD is approved (409)', async () => {
    const id = await newPosition();
    await expect(exportDocx(owner, id, null)).rejects.toMatchObject({ status: 409 });
    await expect(startPdfExport(owner, id)).rejects.toMatchObject({ status: 409 });
    expect(await run((tx) => getPdfStatus(tx, owner, id))).toEqual({
      versionId: null,
      document: null,
    });
  });

  it('builds a Word file with the agency, position, found sections and requirements by priority', async () => {
    const id = await newPosition();
    const content = structuredJdContent([
      { id: crypto.randomUUID(), text: 'Go, 5+ years', category: 'must_have' },
      { id: crypto.randomUUID(), text: 'Kubernetes', category: 'preferred' },
      { id: crypto.randomUUID(), text: 'A bonus skill', category: 'nice_to_have' },
      { id: crypto.randomUUID(), text: 'No agency submissions', category: 'disqualifying' },
    ]);
    (content.sections as Record<string, unknown>).compensation = { status: 'missing', summary: '' };
    (content.sections as Record<string, unknown>).position_summary = {
      status: 'found',
      summary: 'Build payment services.\nOwn reliability.',
    };
    await approveStructuredJd(run, owner, id, content);
    const file = await exportDocx(owner, id, null);
    expect(file.filename).toBe('Staff-Engineer.docx');
    expect(file.bytes.subarray(0, 2).toString()).toBe('PK'); // a zip container
    const body = await text(file.bytes);
    expect(body).toContain('Acme Search');
    expect(body).toContain('Staff Engineer');
    expect(body).toContain('Northwind · Seoul');
    expect(body).toContain('Position summary');
    expect(body).toContain('Build payment services.');
    expect(body).toContain('Own reliability.');
    for (const item of ['Go, 5+ years', 'Kubernetes', 'A bonus skill'])
      expect(body).toContain(item);
    expect(body).toContain('Must-have');
    expect(body).not.toContain('No agency submissions');
    expect(body).not.toContain('Compensation');
  });

  it('logs each export on the timeline, and is for the owner, a lead or an admin', async () => {
    const id = await newPosition();
    await approveStructuredJd(run, owner, id);
    await exportDocx(owner, id, null);
    const log = await admin.query(
      `SELECT data FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'position.jd_exported'`,
      [id],
    );
    expect(log.rows.map((r) => r.data.format)).toEqual(['docx']);
    await expect(exportDocx(other, id, null)).rejects.toMatchObject({ status: 403 });
    await expect(startPdfExport(other, id)).rejects.toMatchObject({ status: 403 });
  });

  it.skipIf(!redisAvailable())(
    'queues the PDF render once for the same content and branding',
    async () => {
      const id = await newPosition();
      const versionId = await approveStructuredJd(run, owner, id);
      const first = await startPdfExport(owner, id);
      const second = await startPdfExport(owner, id);
      expect(first.versionId).toBe(versionId);
      expect(second.jobRunId).toBe(first.jobRunId);
      const row = await admin.query(`SELECT queue, name, status FROM "JobRun" WHERE id = $1`, [
        first.jobRunId,
      ]);
      expect(row.rows[0]).toMatchObject({ queue: 'documents', name: 'render' });
    },
  );
});
