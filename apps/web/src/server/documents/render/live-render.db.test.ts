// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  submissionReportContentSchema,
  tailoredResumeContentSchema,
  type AgencyActor,
} from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  findOrCreateArtifact,
  setFactCheck,
} from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { approveStructuredJd } from '@/test/jd-fixtures';
import { readyMatchEntry } from '@/test/match-fixtures';
import { createChromiumRenderer, findChromium } from './renderer';
import { renderDocument } from './service';

/**
 * Manual check of the three print pages in a real browser (ADR-011). It needs a running app that
 * uses the TEST database and the same secret, and a Chromium:
 *
 *   AUTH_SECRET=live-secret DATABASE_URL=<test db url as easemuse_app> pnpm dev   (port 3100)
 *   LIVE_RENDER_URL=http://localhost:3100 AUTH_SECRET=live-secret pnpm test -- live-render
 *
 * Without LIVE_RENDER_URL the test is skipped, so `pnpm check` never needs a browser.
 */
const base = process.env.LIVE_RENDER_URL;
const secret = process.env.AUTH_SECRET;

describe.skipIf(!dbAvailable() || !base || !secret)('print pages in a real browser', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Live render');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Live Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  const approve = async (
    entryId: string,
    kind: 'tailored_resume' | 'submission_report',
    content: unknown,
  ) => {
    const artifact = await run((tx) =>
      findOrCreateArtifact(tx, {
        agencyId: agency,
        kind,
        subject: { type: 'pipeline_entry', id: entryId },
      }),
    );
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: artifact.id,
        content,
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await run((tx) => setFactCheck(tx, v.id, { ranAt: new Date().toISOString(), warnings: [] }));
    await run((tx) => approveVersion(tx, rec, v.id));
    return v.id;
  };

  it('prints the JD, the resume and the report to real PDFs', async () => {
    const executablePath = process.env.CHROMIUM_PATH ?? (await findChromium()) ?? undefined;
    const deps = {
      withAgency: run,
      renderer: createChromiumRenderer({ executablePath }),
      store: null,
      baseUrl: base!,
      secret: secret!,
    };
    const { entry, positionId } = await readyMatchEntry(run, rec, clientId);
    const jd = await approveStructuredJd(run, rec, positionId);
    const resume = await approve(
      entry.id,
      'tailored_resume',
      tailoredResumeContentSchema.parse({
        header: { name: 'Alex Kim', email: 'alex@example.com' },
        headline: 'HR Director, Northwind',
        summary: 'HR leader.',
        roles: [
          {
            company: 'Northwind',
            title: 'HR Director',
            start: '2019',
            current: true,
            bullets: ['Led a team of 20'],
          },
        ],
        education: [{ school: 'SNU', degree: 'BA', year: '2012' }],
        skills: ['Payroll'],
      }),
    );
    const report = await approve(
      entry.id,
      'submission_report',
      submissionReportContentSchema.parse({
        overview: 'A strong fit.',
        recruiterAssessment: 'My pick.',
      }),
    );
    for (const [kind, versionId] of [
      ['jd', jd],
      ['resume', resume],
      ['report', report],
    ] as const) {
      const result = await renderDocument(deps, {
        agencyId: agency,
        requestedById: rec.userId,
        kind,
        versionId,
      });
      const blob = await admin.query(`SELECT b.bytes FROM "FileBlob" b WHERE b."fileId" = $1`, [
        result.fileId,
      ]);
      const bytes = Buffer.from(blob.rows[0].bytes);
      expect(bytes.subarray(0, 5).toString(), kind).toBe('%PDF-');
      expect(bytes.byteLength, kind).toBeGreaterThan(5_000);
      // Set LIVE_RENDER_OUT to a folder to look at the PDFs yourself.
      if (process.env.LIVE_RENDER_OUT)
        writeFileSync(path.join(process.env.LIVE_RENDER_OUT, `${kind}.pdf`), bytes);
    }
  }, 120_000);
});
