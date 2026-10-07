// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';

/**
 * An artifact points at its subject (position, candidate, pipeline entry, interview) by id with no
 * database foreign key (ADR-006), so a deleted subject leaves an orphan. This finds them; the
 * nightly job reports them (T-AI-15). Both tables are read under the agency's RLS scope.
 */
export interface OrphanReport {
  total: number;
  /** Count and a few ids per artifact kind. */
  byKind: Record<string, { count: number; sampleIds: string[] }>;
}

const SAMPLE = 20;

export async function findOrphanedArtifacts(tx: ScopedTx): Promise<OrphanReport> {
  const rows = await Promise.all([
    tx.$queryRaw<{ id: string; kind: string }[]>`
      SELECT a.id, a.kind::text AS kind FROM "Artifact" a
      WHERE a."subjectType" = 'position' AND NOT EXISTS (SELECT 1 FROM "Position" s WHERE s.id = a."subjectId")`,
    tx.$queryRaw<{ id: string; kind: string }[]>`
      SELECT a.id, a.kind::text AS kind FROM "Artifact" a
      WHERE a."subjectType" = 'candidate' AND NOT EXISTS (SELECT 1 FROM "Candidate" s WHERE s.id = a."subjectId")`,
    tx.$queryRaw<{ id: string; kind: string }[]>`
      SELECT a.id, a.kind::text AS kind FROM "Artifact" a
      WHERE a."subjectType" = 'pipeline_entry' AND NOT EXISTS (SELECT 1 FROM "PipelineEntry" s WHERE s.id = a."subjectId")`,
    tx.$queryRaw<{ id: string; kind: string }[]>`
      SELECT a.id, a.kind::text AS kind FROM "Artifact" a
      WHERE a."subjectType" = 'interview' AND NOT EXISTS (SELECT 1 FROM "Interview" s WHERE s.id = a."subjectId")`,
  ]);
  const byKind: OrphanReport['byKind'] = {};
  for (const row of rows.flat()) {
    const entry = (byKind[row.kind] ??= { count: 0, sampleIds: [] });
    entry.count += 1;
    if (entry.sampleIds.length < SAMPLE) entry.sampleIds.push(row.id);
  }
  return { total: rows.flat().length, byKind };
}

export interface OrphanRunDeps {
  agencyIds(): Promise<string[]>;
  withAgency<T>(agencyId: string, fn: (tx: ScopedTx) => Promise<T>): Promise<T>;
  log?(message: string, data: Record<string, unknown>): void;
}

export interface OrphanRunSummary {
  agencies: number;
  orphanedArtifacts: number;
  affectedAgencies: { agencyId: string; count: number }[];
}

/**
 * The nightly report: checks every agency, writes one activity-log entry per agency that has
 * orphans (counts and ids only, never content) and returns the totals for the job record.
 */
export async function runOrphanReport(deps: OrphanRunDeps): Promise<OrphanRunSummary> {
  const log = deps.log ?? (() => undefined);
  const ids = await deps.agencyIds();
  const affected: OrphanRunSummary['affectedAgencies'] = [];
  let total = 0;
  for (const agencyId of ids) {
    const report = await deps.withAgency(agencyId, async (tx) => {
      const found = await findOrphanedArtifacts(tx);
      if (found.total > 0) {
        const firstId = Object.values(found.byKind)[0]!.sampleIds[0]!;
        await tx.activityLog.create({
          data: {
            agencyId,
            actorType: 'system',
            action: 'artifacts.orphan_report',
            entityType: 'artifact',
            entityId: firstId,
            data: {
              total: found.total,
              byKind: Object.fromEntries(
                Object.entries(found.byKind).map(([k, v]) => [k, v.count]),
              ),
            },
          },
        });
      }
      return found;
    });
    if (report.total > 0) {
      total += report.total;
      affected.push({ agencyId, count: report.total });
      log('artifacts.orphans_found', { agencyId, count: report.total });
    }
  }
  return { agencies: ids.length, orphanedArtifacts: total, affectedAgencies: affected };
}
