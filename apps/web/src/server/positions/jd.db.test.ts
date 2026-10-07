// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import type { JobContext } from '@/worker/registry';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { createClient } from '@/server/clients/service';
import { extractJd } from './jd-extract';
import { addPastedOriginal, addUploadedOriginal, listOriginals } from './jd';
import { createPosition } from './service';

const JD_TEXT = `Senior Backend Engineer. We are hiring a senior backend engineer to design and run our payment services.
Responsibilities include building APIs, owning reliability, mentoring engineers, and working with product managers.
Requirements: eight years of experience, strong Go or Java, PostgreSQL, and experience with distributed systems.`;

describe.skipIf(!dbAvailable())('original JD upload and extraction (T-1-05)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let owner: AgencyActor;
  let other: AgencyActor;
  let outsider: AgencyActor;
  let positionId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);
  const ctxFor = (jobDescriptionId: string): JobContext => ({
    jobRunId: randomUUID(),
    agencyId: agencyA,
    requestedById: owner.userId,
    data: { jobDescriptionId },
    attempt: 1,
    withAgency: (fn) => inA(fn),
    progress: async () => undefined,
  });
  const upload = (filename: string, content: string | Uint8Array) =>
    inA((tx) =>
      addUploadedOriginal(tx, owner, positionId, {
        filename,
        bytes: typeof content === 'string' ? new TextEncoder().encode(content) : content,
      }),
    );

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'JD A');
    agencyB = await createAgency(admin, 'JD B');
    const [u1, u2, u3] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyA, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId: agencyA, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId: agencyA, role: 'recruiter' };
    outsider = { kind: 'agency', userId: u3, agencyId: agencyB, role: 'recruiter' };
    const client = (await inA((tx) => createClient(tx, owner, { name: 'JD Client' }))).client;
    positionId = (
      await inA((tx) =>
        createPosition(tx, owner, { clientId: client.id, title: 'Backend', location: 'Seoul' }),
      )
    ).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('stores pasted text as the original, ready at once', async () => {
    const jd = await inA((tx) => addPastedOriginal(tx, owner, positionId, JD_TEXT));
    expect(jd).toMatchObject({
      extractionStatus: 'ready',
      extractionMethod: 'pasted',
      text: JD_TEXT,
      fileId: null,
    });
  });

  it('stores an upload unchanged and pending, then the worker reads its text', async () => {
    const jd = await upload('jd.txt', JD_TEXT);
    expect(jd).toMatchObject({ extractionStatus: 'pending', text: null, filename: 'jd.txt' });
    const blob = await admin.query(`SELECT b.bytes FROM "FileBlob" b WHERE b."fileId" = $1`, [
      jd.fileId,
    ]);
    expect(Buffer.from(blob.rows[0].bytes).toString()).toBe(JD_TEXT);
    await extractJd(ctxFor(jd.id));
    const done = (await inA((tx) => listOriginals(tx, owner, positionId))).find(
      (j) => j.id === jd.id,
    )!;
    expect(done).toMatchObject({
      extractionStatus: 'ready',
      extractionMethod: 'text',
      parsedFromImage: false,
    });
    expect(done.text).toBe(JD_TEXT);
    // Running it again changes nothing.
    await extractJd(ctxFor(jd.id));
  });

  it('records why a file could not be read, without retrying', async () => {
    const short = await upload('tiny.txt', 'too short');
    await expect(extractJd(ctxFor(short.id))).resolves.toBeUndefined();
    const failed = (await inA((tx) => listOriginals(tx, owner, positionId))).find(
      (j) => j.id === short.id,
    )!;
    expect(failed.extractionStatus).toBe('failed');
    expect(failed.extractionError).toBeTruthy();
    expect(failed.text).toBeNull();
  });

  it('rejects unsupported and empty files before storing anything', async () => {
    await expect(
      upload('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])),
    ).rejects.toMatchObject({ status: 415 });
    await expect(upload('empty.txt', new Uint8Array())).rejects.toMatchObject({ status: 422 });
  });

  it('lists newest first and keeps earlier originals', async () => {
    const list = await inA((tx) => listOriginals(tx, owner, positionId));
    expect(list.length).toBeGreaterThanOrEqual(3);
    const times = list.map((j) => j.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('lets only the owner (or a lead) add originals, and keeps agencies apart', async () => {
    await expect(
      inA((tx) => addPastedOriginal(tx, other, positionId, JD_TEXT)),
    ).rejects.toMatchObject({ status: 403 });
    expect((await inA((tx) => listOriginals(tx, other, positionId))).length).toBeGreaterThan(0); // readable
    await expect(
      appScope(handle).withAgency(agencyB, (tx) => listOriginals(tx, outsider, positionId)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      appScope(handle).withAgency(agencyB, (tx) =>
        addPastedOriginal(tx, outsider, positionId, JD_TEXT),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
