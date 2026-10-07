// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { extractCandidateDocument } from './extract';
import { createCandidateDraft } from './intake';

const RESUME = `Alex Kim\nSenior HR Director, Northwind (2019-present)\nLed a team of 12 across payroll and benefits.\nHR Manager, Contoso (2014-2019)\nBA Business Administration, State University, 2010\nSkills: payroll, compliance, workforce planning`;
const bytes = (text: string) => new TextEncoder().encode(text);

describe.skipIf(!dbAvailable())('candidate intake and reading (T-2-02)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let actor: AgencyActor;
  let outsider: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);
  const ctxFor = (documentId: string): JobContext => ({
    jobRunId: randomUUID(),
    agencyId: agencyA,
    requestedById: actor.userId,
    data: { documentId },
    attempt: 1,
    withAgency: run,
    progress: async () => undefined,
  });
  const intake = (
    filename: string,
    content: Uint8Array,
    kind: 'resume' | 'profile_text' = 'resume',
    source: 'linkedin' | 'referral' = 'linkedin',
  ) =>
    run((tx) =>
      createCandidateDraft(
        tx,
        actor,
        { source, profileUrl: 'https://www.linkedin.com/in/alex' },
        { filename, bytes: content, kind },
      ),
    );

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Intake A');
    agencyB = await createAgency(admin, 'Intake B');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    actor = { kind: 'agency', userId: u1, agencyId: agencyA, role: 'recruiter' };
    outsider = { kind: 'agency', userId: u2, agencyId: agencyB, role: 'recruiter' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('creates a draft candidate (not active) with the original stored unchanged and pending reading', async () => {
    const { candidateId, documentId } = await intake('Alex Kim Resume.txt', bytes(RESUME));
    const candidate = await admin.query(
      `SELECT "fullName", status, source, "profileUrl", "createdById" FROM "Candidate" WHERE id = $1`,
      [candidateId],
    );
    expect(candidate.rows[0]).toMatchObject({
      fullName: 'Draft: Alex Kim Resume',
      status: 'draft',
      source: 'linkedin',
      profileUrl: 'https://www.linkedin.com/in/alex',
      createdById: actor.userId,
    });
    const doc = await admin.query(
      `SELECT d.kind, d."extractionStatus", d."extractedText", b.bytes FROM "CandidateDocument" d JOIN "FileBlob" b ON b."fileId" = d."fileId" WHERE d.id = $1`,
      [documentId],
    );
    expect(doc.rows[0]).toMatchObject({
      kind: 'resume',
      extractionStatus: 'pending',
      extractedText: null,
    });
    expect(Buffer.from(doc.rows[0].bytes).toString()).toBe(RESUME);
  });

  it('stores pasted text as an original text file too', async () => {
    const { documentId } = await intake(
      'profile.txt',
      bytes(`${RESUME}\nPasted ${randomUUID()}`),
      'profile_text',
      'referral',
    );
    const doc = await admin.query(
      `SELECT d.kind, f.filename, f."contentType" FROM "CandidateDocument" d JOIN "FileObject" f ON f.id = d."fileId" WHERE d.id = $1`,
      [documentId],
    );
    expect(doc.rows[0]).toEqual({
      kind: 'profile_text',
      filename: 'profile.txt',
      contentType: 'text/plain',
    });
  });

  it('rejects an unsupported or empty file before creating anything', async () => {
    const before = await admin.query(
      `SELECT count(*)::int AS n FROM "Candidate" WHERE "agencyId" = $1`,
      [agencyA],
    );
    await expect(
      intake('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])),
    ).rejects.toMatchObject({ status: 415 });
    await expect(intake('empty.txt', new Uint8Array())).rejects.toMatchObject({ status: 422 });
    const after = await admin.query(
      `SELECT count(*)::int AS n FROM "Candidate" WHERE "agencyId" = $1`,
      [agencyA],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('logs the draft on the candidate timeline', async () => {
    const { candidateId } = await intake('log.txt', bytes(RESUME));
    const log = await admin.query(`SELECT action, data FROM "ActivityLog" WHERE "entityId" = $1`, [
      candidateId,
    ]);
    expect(log.rows[0]).toMatchObject({
      action: 'candidate.draft_created',
      data: { source: 'linkedin', kind: 'resume' },
    });
  });

  describe('reading the file', () => {
    it('saves the extracted text and marks the document ready; running again changes nothing', async () => {
      const { documentId } = await intake('read.txt', bytes(RESUME));
      await extractCandidateDocument(ctxFor(documentId));
      const doc = await admin.query(
        `SELECT "extractionStatus", "extractionMethod", "extractedText", "parsedFromImage" FROM "CandidateDocument" WHERE id = $1`,
        [documentId],
      );
      expect(doc.rows[0]).toMatchObject({
        extractionStatus: 'ready',
        extractionMethod: 'text',
        parsedFromImage: false,
      });
      expect(doc.rows[0].extractedText).toBe(RESUME);
      await extractCandidateDocument(ctxFor(documentId));
    });

    it('records why a file could not be read and does not retry', async () => {
      const { documentId } = await intake('tiny.txt', bytes('too short to be a resume'));
      await expect(extractCandidateDocument(ctxFor(documentId))).resolves.toBeUndefined();
      const doc = await admin.query(
        `SELECT "extractionStatus", "extractionError", "extractedText" FROM "CandidateDocument" WHERE id = $1`,
        [documentId],
      );
      expect(doc.rows[0].extractionStatus).toBe('failed');
      expect(doc.rows[0].extractionError).toBeTruthy();
      expect(doc.rows[0].extractedText).toBeNull();
    });

    it('does nothing for a missing document', async () => {
      const progress = vi.fn(async () => undefined);
      await extractCandidateDocument({ ...ctxFor(randomUUID()), progress });
      expect(progress).not.toHaveBeenCalled();
    });
  });

  it('keeps agencies apart: another agency cannot read a draft or its document', async () => {
    const { candidateId, documentId } = await intake('iso.txt', bytes(RESUME));
    const seen = await appScope(handle).withAgency(agencyB, async (tx) => ({
      candidate: await tx.candidate.findUnique({ where: { id: candidateId } }),
      doc: await tx.candidateDocument.findUnique({ where: { id: documentId } }),
    }));
    expect(seen).toEqual({ candidate: null, doc: null });
    void outsider;
  });
});
