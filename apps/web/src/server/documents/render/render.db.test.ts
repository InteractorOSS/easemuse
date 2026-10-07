// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import type { JobContext } from '@/worker/registry';
import { createClient } from '@/server/clients/service';
import { createPosition } from '@/server/positions/service';
import { createMemoryObjectStore } from '@/server/files/object-store';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { approveStructuredJd, structuredJdContent } from '@/test/jd-fixtures';
import { addDraftVersion, createArtifact, findArtifact } from '@/server/artifacts/service';
import { runRenderJob } from './job';
import { findRenderedDocument, renderDocument, type RenderDeps } from './service';
import { verifyRenderToken } from './token';

const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...new Uint8Array(200).fill(65)]);

describe.skipIf(!dbAvailable())('PDF render pipeline (T-1-11)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let agencyB: string;
  let actor: AgencyActor;
  let positionId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  const urls: string[] = [];
  const renderer = vi.fn(async (url: string) => {
    urls.push(url);
    return PDF;
  });
  const deps = (over: Partial<RenderDeps> = {}): RenderDeps => ({
    withAgency: run,
    renderer,
    store: null,
    baseUrl: 'http://app.test/',
    secret: 'test-secret',
    ...over,
  });
  const input = (versionId: string, kind: 'jd' = 'jd') => ({
    agencyId,
    requestedById: actor.userId,
    kind,
    versionId,
  });

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Render A');
    agencyB = await createAgency(admin, 'Render B');
    const userId = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
      [agencyId, userId],
    );
    actor = { kind: 'agency', userId, agencyId, role: 'recruiter' };
    const client = (await run((tx) => createClient(tx, actor, { name: 'Render Client' }))).client;
    positionId = (
      await run((tx) =>
        createPosition(tx, actor, { clientId: client.id, title: 'Backend', location: 'Seoul' }),
      )
    ).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('renders an approved version through the print route with a token bound to it, and keeps the PDF', async () => {
    const versionId = await approveStructuredJd(run, actor, positionId);
    const result = await renderDocument(deps(), input(versionId));
    expect(result.reused).toBe(false);
    const url = new URL(urls.at(-1)!);
    expect(url.origin + url.pathname).toBe(`http://app.test/render/jd/${versionId}`);
    expect(url.searchParams.get('agency')).toBe(agencyId);
    expect(
      verifyRenderToken({
        secret: 'test-secret',
        agencyId,
        versionId,
        token: url.searchParams.get('token'),
      }),
    ).toBe(true);
    const blob = await admin.query(
      `SELECT b.bytes, f.sha256 FROM "FileObject" f JOIN "FileBlob" b ON b."fileId" = f.id WHERE f.id = $1`,
      [result.fileId],
    );
    expect(Buffer.from(blob.rows[0].bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('reuses the stored PDF while the content and branding are unchanged', async () => {
    const versionId = await approveStructuredJd(
      run,
      actor,
      positionId,
      structuredJdContent([{ id: crypto.randomUUID(), text: 'Reuse me', category: 'must_have' }]),
    );
    const first = await renderDocument(deps(), input(versionId));
    const calls = renderer.mock.calls.length;
    const second = await renderDocument(deps(), input(versionId));
    expect(second).toMatchObject({
      reused: true,
      documentId: first.documentId,
      fileId: first.fileId,
    });
    expect(renderer.mock.calls.length).toBe(calls);
    expect(
      (await run((tx) => findRenderedDocument(tx, { agencyId, kind: 'jd', versionId })))?.upToDate,
    ).toBe(true);
  });

  it('renders again after the agency branding changes, and reports the older PDF as out of date until then', async () => {
    const versionId = await approveStructuredJd(
      run,
      actor,
      positionId,
      structuredJdContent([{ id: crypto.randomUUID(), text: 'Branding', category: 'preferred' }]),
    );
    const first = await renderDocument(deps(), input(versionId));
    await admin.query(
      `UPDATE "Agency" SET branding = '{"primaryColor":"#aa0000"}'::jsonb WHERE id = $1`,
      [agencyId],
    );
    try {
      const stale = await run((tx) =>
        findRenderedDocument(tx, { agencyId, kind: 'jd', versionId }),
      );
      expect(stale).toMatchObject({ fileId: first.fileId, upToDate: false });
      const second = await renderDocument(deps(), input(versionId));
      expect(second.reused).toBe(false);
      expect(second.contentHash).not.toBe(first.contentHash);
      expect(
        await run((tx) => findRenderedDocument(tx, { agencyId, kind: 'jd', versionId })),
      ).toMatchObject({ fileId: second.fileId, upToDate: true });
    } finally {
      await admin.query(`UPDATE "Agency" SET branding = '{}'::jsonb WHERE id = $1`, [agencyId]);
    }
  });

  it('only renders approved versions, never a draft, and only the kind the template is for', async () => {
    const artifact = (await run((tx) =>
      findArtifact(tx, { kind: 'structured_jd', subject: { type: 'position', id: positionId } }),
    ))!;
    const draft = await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content: structuredJdContent(),
        origin: 'human',
        createdById: actor.userId,
      }),
    );
    await expect(renderDocument(deps(), input(draft.id))).rejects.toMatchObject({ status: 404 });
    const other = await run((tx) =>
      createArtifact(tx, {
        agencyId,
        kind: 'benchmark_report',
        subject: { type: 'position', id: positionId },
      }),
    );
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: other.id,
        content: { a: 1 },
        origin: 'human',
        createdById: actor.userId,
      }),
    );
    await expect(renderDocument(deps(), input(v.id))).rejects.toMatchObject({ status: 404 });
  });

  it("does not render another agency's version", async () => {
    const versionId = await approveStructuredJd(
      run,
      actor,
      positionId,
      structuredJdContent([{ id: crypto.randomUUID(), text: 'Mine', category: 'must_have' }]),
    );
    await expect(
      renderDocument(
        { ...deps(), withAgency: (fn) => appScope(handle).withAgency(agencyB, fn) },
        { ...input(versionId), agencyId: agencyB },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects an empty render and records nothing', async () => {
    const versionId = await approveStructuredJd(
      run,
      actor,
      positionId,
      structuredJdContent([{ id: crypto.randomUUID(), text: 'Empty', category: 'must_have' }]),
    );
    await expect(
      renderDocument(deps({ renderer: async () => new Uint8Array(3) }), input(versionId)),
    ).rejects.toMatchObject({ status: 502 });
    expect(await run((tx) => tx.renderedDocument.count({ where: { versionId } }))).toBe(0);
  });

  it('stores in object storage when it is configured', async () => {
    const store = createMemoryObjectStore();
    const versionId = await approveStructuredJd(
      run,
      actor,
      positionId,
      structuredJdContent([{ id: crypto.randomUUID(), text: 'S3', category: 'must_have' }]),
    );
    const result = await renderDocument(deps({ store }), input(versionId));
    const file = await admin.query(
      `SELECT store, "externalRef", "contentType" FROM "FileObject" WHERE id = $1`,
      [result.fileId],
    );
    expect(file.rows[0]).toMatchObject({ store: 's3', contentType: 'application/pdf' });
    expect(file.rows[0].externalRef).toContain(agencyId);
  });

  it('runs as the documents:render job', async () => {
    const versionId = await approveStructuredJd(
      run,
      actor,
      positionId,
      structuredJdContent([{ id: crypto.randomUUID(), text: 'Job', category: 'must_have' }]),
    );
    const progress = vi.fn(async () => undefined);
    const ctx: JobContext = {
      jobRunId: 'j',
      agencyId,
      requestedById: actor.userId,
      data: { kind: 'jd', versionId },
      attempt: 1,
      withAgency: run,
      progress,
    };
    await runRenderJob(ctx, {
      renderer,
      store: null,
      secret: 'test-secret',
      baseUrl: 'http://app.test',
    });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ reused: false }));
    await expect(
      runRenderJob({ ...ctx, agencyId: null }, { renderer, secret: 'test-secret' }),
    ).rejects.toThrow(/agency/);
    await expect(
      runRenderJob(
        { ...ctx, data: { kind: 'resume', versionId } },
        { renderer, secret: 'test-secret' },
      ),
    ).rejects.toBeDefined();
  });
});
