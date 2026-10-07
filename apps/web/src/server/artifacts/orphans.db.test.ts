// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/lib/db/client';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import { findOrphanedArtifacts, runOrphanReport } from './orphans';
import { createArtifact } from './service';

describe.skipIf(!dbAvailable())('orphaned artifact report (T-AI-15)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let dirty: string;
  let clean: string;
  const userId = randomUUID();
  const scope = () => appScope(handle);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(3);
    dirty = await createAgency(admin, 'Orphans');
    clean = await createAgency(admin, 'Clean');

    // Dirty agency: one real position with an artifact, plus artifacts pointing at nothing.
    await scope().withAgency(dirty, async (tx) => {
      const client = await tx.client.create({ data: { agencyId: dirty, name: 'C' } });
      const position = await tx.position.create({
        data: {
          agencyId: dirty,
          clientId: client.id,
          ownerId: userId,
          title: 'Real',
          location: 'X',
          matchingWeights: {},
        },
      });
      await createArtifact(tx, {
        agencyId: dirty,
        kind: 'improved_jd',
        subject: { type: 'position', id: position.id },
      });
      await createArtifact(tx, {
        agencyId: dirty,
        kind: 'improved_jd',
        subject: { type: 'position', id: randomUUID() },
      });
      await createArtifact(tx, {
        agencyId: dirty,
        kind: 'success_profile',
        subject: { type: 'position', id: randomUUID() },
      });
      await createArtifact(tx, {
        agencyId: dirty,
        kind: 'candidate_profile',
        subject: { type: 'candidate', id: randomUUID() },
      });
      await createArtifact(tx, {
        agencyId: dirty,
        kind: 'match_analysis',
        subject: { type: 'pipeline_entry', id: randomUUID() },
      });
      await createArtifact(tx, {
        agencyId: dirty,
        kind: 'interview_feedback',
        subject: { type: 'interview', id: randomUUID() },
      });
    });
    await scope().withAgency(clean, async (tx) => {
      const client = await tx.client.create({ data: { agencyId: clean, name: 'C' } });
      const position = await tx.position.create({
        data: {
          agencyId: clean,
          clientId: client.id,
          ownerId: userId,
          title: 'P',
          location: 'X',
          matchingWeights: {},
        },
      });
      await createArtifact(tx, {
        agencyId: clean,
        kind: 'improved_jd',
        subject: { type: 'position', id: position.id },
      });
    });
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [dirty, clean] });
    await admin.end();
    await handle.close();
  });

  it('finds artifacts whose subject is gone, for every subject type, and not the healthy one', async () => {
    const report = await scope().withAgency(dirty, (tx) => findOrphanedArtifacts(tx));
    expect(report.total).toBe(5);
    expect(Object.fromEntries(Object.entries(report.byKind).map(([k, v]) => [k, v.count]))).toEqual(
      {
        improved_jd: 1,
        success_profile: 1,
        candidate_profile: 1,
        match_analysis: 1,
        interview_feedback: 1,
      },
    );
    expect(report.byKind.improved_jd!.sampleIds).toHaveLength(1);
  });

  it('reports nothing for a clean agency', async () => {
    expect((await scope().withAgency(clean, (tx) => findOrphanedArtifacts(tx))).total).toBe(0);
  });

  it('only sees the agency in scope', async () => {
    const report = await scope().withAgency(clean, (tx) => findOrphanedArtifacts(tx));
    expect(report.byKind).toEqual({});
  });

  it('runs across agencies, logs one activity entry per affected agency, and returns totals', async () => {
    const logged: string[] = [];
    const summary = await runOrphanReport({
      agencyIds: async () => [dirty, clean],
      withAgency: (id, fn) => scope().withAgency(id, fn),
      log: (message) => logged.push(message),
    });
    expect(summary).toEqual({
      agencies: 2,
      orphanedArtifacts: 5,
      affectedAgencies: [{ agencyId: dirty, count: 5 }],
    });
    expect(logged).toEqual(['artifacts.orphans_found']);

    const entries = (
      await admin.query(
        `SELECT "actorType", data FROM "ActivityLog" WHERE action = 'artifacts.orphan_report' AND "agencyId" = ANY($1::uuid[])`,
        [[dirty, clean]],
      )
    ).rows;
    expect(entries).toHaveLength(1);
    expect(entries[0].actorType).toBe('system');
    expect(entries[0].data.total).toBe(5);
    expect(JSON.stringify(entries[0].data)).not.toMatch(/Real|title/);
  });
});
