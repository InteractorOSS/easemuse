// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { searchCandidates, type CandidateSummary } from '@/server/candidates/search';
import { listPositions, type PositionView } from '@/server/positions/service';

/** One box for clients, positions and candidates (FR-PLT-06): a few of each, inside the person's permissions. */
export interface GlobalSearchResult {
  clients: { id: string; name: string; archived: boolean }[];
  positions: Pick<PositionView, 'id' | 'title' | 'clientName' | 'status'>[];
  candidates: Pick<CandidateSummary, 'id' | 'fullName' | 'currentTitle' | 'location'>[];
}

export const GLOBAL_SEARCH_LIMIT = 5;

export async function globalSearch(
  tx: ScopedTx,
  actor: AgencyActor,
  q: string,
): Promise<GlobalSearchResult> {
  const text = q.trim();
  if (text.length < 2) return { clients: [], positions: [], candidates: [] };
  const clients = await tx.client.findMany({
    where: { name: { contains: text, mode: 'insensitive' } },
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    take: GLOBAL_SEARCH_LIMIT,
    select: { id: true, name: true, archivedAt: true },
  });
  // Positions go through the same visibility rule as the position list.
  const positions = await listPositions(tx, actor, { limit: GLOBAL_SEARCH_LIMIT, q: text });
  const candidates = await searchCandidates(tx, { q: text }, { limit: GLOBAL_SEARCH_LIMIT });
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.name, archived: c.archivedAt !== null })),
    positions: positions.items.map((p) => ({
      id: p.id,
      title: p.title,
      clientName: p.clientName,
      status: p.status,
    })),
    candidates: candidates.items.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      currentTitle: c.currentTitle,
      location: c.location,
    })),
  };
}
