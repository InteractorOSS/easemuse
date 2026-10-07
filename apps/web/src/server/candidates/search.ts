// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { toPrefixTsQuery, type CandidateSearchQuery } from '@easemuse/core';
import { emptySql, joinSql, sql, type ScopedTx, type Sql } from '@/lib/db';
import { decodeCursor, encodeCursor } from '@/lib/http/pagination';

/**
 * Talent pool search (T-2-09, US-207, ADR-008): full-text over the approved profiles plus filters,
 * best match first when there is a search text, newest first otherwise. Only active candidates are
 * searched; the tenant boundary is the database policy, so another agency's people never appear.
 */
export interface CandidateSummary {
  id: string;
  fullName: string;
  currentTitle: string | null;
  location: string | null;
  seniority: string | null;
  skills: string[];
  yearsExperience: number | null;
  availability: string | null;
  lastContactedAt: Date | null;
  doNotContact: boolean;
  tags: string[];
  /** Match strength for a text search, null when there is no text. */
  rank: number | null;
}

type Row = Omit<CandidateSummary, 'rank'> & { rank: number | null };

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchCandidates(
  tx: ScopedTx,
  query: CandidateSearchQuery,
  page: { limit: number; cursor?: string | undefined },
): Promise<{ items: CandidateSummary[]; nextCursor: string | null }> {
  const tsquery = toPrefixTsQuery(query.q);
  const conditions: Sql[] = [sql`c.status = 'active'`, sql`c."mergedIntoId" IS NULL`];
  if (tsquery) conditions.push(sql`c."searchText" @@ q.query`);
  if (query.skills?.length) {
    const wanted = query.skills.map((s) => s.toLowerCase());
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM unnest(${wanted}::text[]) AS want(skill)
      WHERE NOT EXISTS (SELECT 1 FROM unnest(c.skills) AS have(skill) WHERE lower(have.skill) = want.skill))`);
  }
  if (query.tags?.length) conditions.push(sql`c.tags @> ${query.tags}::text[]`);
  if (query.location) conditions.push(sql`c.location ILIKE ${`%${escapeLike(query.location)}%`}`);
  if (query.seniority) conditions.push(sql`lower(c.seniority) = lower(${query.seniority})`);
  if (query.minYears !== undefined) conditions.push(sql`c."yearsExperience" >= ${query.minYears}`);
  if (query.maxYears !== undefined) conditions.push(sql`c."yearsExperience" <= ${query.maxYears}`);

  const key = page.cursor ? decodeCursor(page.cursor) : undefined;
  const take = page.limit + 1;
  const columns = sql`c.id, c."fullName", c."currentTitle", c.location, c.seniority, c.skills, c."yearsExperience",
    c.availability, c."lastContactedAt", c."doNotContact", c.tags`;
  const where = joinSql(conditions, ' AND ');

  let rows: Row[];
  if (tsquery) {
    // Best match first. The cursor is the last row's rank and id; equal ranks are broken by id.
    const after = key
      ? sql`WHERE r.rank < ${Number(key.v)}::float8 OR (r.rank = ${Number(key.v)}::float8 AND r.id < ${key.id}::uuid)`
      : emptySql;
    rows = await tx.$queryRaw<Row[]>`
      SELECT * FROM (
        SELECT ${columns}, ts_rank_cd(c."searchText", q.query)::float8 AS rank
        FROM "Candidate" c, to_tsquery('simple', ${tsquery}) AS q(query)
        WHERE ${where}
      ) r ${after}
      ORDER BY r.rank DESC, r.id DESC
      LIMIT ${take}`;
  } else {
    const after = key
      ? sql`AND (c."createdAt", c.id) < (${new Date(key.v)}::timestamp, ${key.id}::uuid)`
      : emptySql;
    rows = await tx.$queryRaw<Row[]>`
      SELECT ${columns}, NULL::float8 AS rank
      FROM "Candidate" c
      WHERE ${where} ${after}
      ORDER BY c."createdAt" DESC, c.id DESC
      LIMIT ${take}`;
  }

  const items = rows.slice(0, page.limit);
  let nextCursor: string | null = null;
  if (rows.length > page.limit) {
    const last = items[items.length - 1]!;
    if (tsquery) nextCursor = encodeCursor({ v: String(last.rank), id: last.id });
    else {
      const stamp = await tx.candidate.findUniqueOrThrow({
        where: { id: last.id },
        select: { createdAt: true },
      });
      nextCursor = encodeCursor({ v: stamp.createdAt.toISOString(), id: last.id });
    }
  }
  return { items, nextCursor };
}
