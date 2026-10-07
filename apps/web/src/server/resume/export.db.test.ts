// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  findOrCreateArtifact,
  setFactCheck,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import {
  findRenderedDocument,
  loadRenderSource,
  renderDocument,
  type RenderDeps,
} from '@/server/documents/render/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { readyMatchEntry } from '@/test/match-fixtures';

const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...new Uint8Array(200).fill(65)]);

describe.skipIf(!dbAvailable())('tailored resume rendering (T-7-03)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const urls: string[] = [];
  const renderer = vi.fn(async (url: string) => {
    urls.push(url);
    return PDF;
  });
  const deps = (): RenderDeps => ({
    withAgency: run,
    renderer,
    store: null,
    baseUrl: 'http://app.test/',
    secret: 'test-secret',
  });

  const approveResume = async (entryId: string, summary = 'HR leader.') => {
    const artifact = await run((tx) =>
      findOrCreateArtifact(tx, {
        agencyId: agency,
        kind: 'tailored_resume',
        subject: { type: 'pipeline_entry', id: entryId },
      }),
    );
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: artifact.id,
        content: { summary },
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await run((tx) => setFactCheck(tx, v.id, { ranAt: new Date().toISOString(), warnings: [] }));
    await run((tx) => approveVersion(tx, rec, v.id));
    return v.id;
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Resume Render');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'RR Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('renders the approved resume through its own print route and reuses the PDF while nothing changed', async () => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    const versionId = await approveResume(entry.id);
    const input = {
      agencyId: agency,
      requestedById: rec.userId,
      kind: 'resume' as const,
      versionId,
    };
    const first = await renderDocument(deps(), input);
    expect(new URL(urls.at(-1)!).pathname).toBe(`/render/resume/${versionId}`);
    expect(first.reused).toBe(false);
    expect((await renderDocument(deps(), input)).reused).toBe(true);
    const found = await run((tx) =>
      findRenderedDocument(tx, { agencyId: agency, kind: 'resume', versionId }),
    );
    expect(found).toMatchObject({ fileId: first.fileId, upToDate: true });
  });

  it('gives a different content hash for a different approved resume, and refuses other kinds of version', async () => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    const a = await approveResume(entry.id, 'One');
    const ha = await run((tx) => loadRenderSource(tx, agency, 'resume', a));
    const b = await approveResume(entry.id, 'Two');
    const hb = await run((tx) => loadRenderSource(tx, agency, 'resume', b));
    expect(ha.hash).not.toBe(hb.hash);
    // Only approved versions render: the older one has been superseded.
    await expect(run((tx) => loadRenderSource(tx, agency, 'resume', a))).rejects.toMatchObject({
      status: 404,
    });
    await expect(run((tx) => loadRenderSource(tx, agency, 'jd', b))).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      run((tx) => loadRenderSource(tx, agency, 'resume', randomUUID())),
    ).rejects.toMatchObject({ status: 404 });
  });
});
