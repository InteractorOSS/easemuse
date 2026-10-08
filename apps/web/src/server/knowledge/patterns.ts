// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { buildPatternReports, type AgencyActor, type PatternReports } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import { requirePosition } from '@/server/positions/service';
import { loadFacts } from './facts';

export interface PatternsView {
  scope: 'client' | 'agency';
  client: { id: string; name: string } | null;
  asOf: string;
  reports: PatternReports;
}

/**
 * The pattern reports for the seven questions of brief 14 (T-12-03, FR-KNW-02): for the client of a
 * position, or across every client whose positions the viewer can see. Descriptive only; the
 * viewer sees the same positions they see in the positions list.
 */
export async function getPatterns(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  scope: 'client' | 'agency',
): Promise<PatternsView> {
  const position = await requirePosition(tx, actor, positionId, 'read');
  const client =
    scope === 'client'
      ? await tx.client.findUnique({
          where: { id: position.clientId },
          select: { id: true, name: true },
        })
      : null;
  if (scope === 'client' && !client) throw notFound('Client');
  const facts = await loadFacts(tx, actor, client ? { clientId: client.id } : {});
  return {
    scope,
    client,
    asOf: new Date().toISOString().slice(0, 10),
    reports: buildPatternReports(facts.entries, facts.positions),
  };
}
