// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  NAME_MATCH_THRESHOLD,
  candidateProfileContentSchema,
  employerKeys,
  nameSimilarity,
  normalizeEmail,
  phoneKey,
  profileUrlKey,
  type DuplicateReason,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import { getArtifactWithVersions, findArtifact } from '@/server/artifacts/service';

/**
 * Duplicate detection (T-2-04, US-203, FR-SRC-04): before a candidate is saved, find people already
 * in the agency who look like the same person. An email, phone or profile link match is `exact`; a
 * very similar name with a shared employer is `possible`. This only shows candidates: merging or
 * linking is the recruiter's decision (T-2-05, T-2-06).
 */
export interface DuplicateQuery {
  /** The candidate being checked, left out of the results. */
  excludeId?: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  profileUrl?: string | null;
  employers?: (string | null | undefined)[];
}

export interface DuplicateMatch {
  candidateId: string;
  fullName: string;
  email: string | null;
  currentTitle: string | null;
  strength: 'exact' | 'possible';
  reasons: DuplicateReason[];
  /** Name similarity from 0 to 1 when the match rests on name and employer. */
  nameScore: number | null;
}

/** The keys stored on a candidate so others can be matched against it cheaply. */
export function matchKeys(input: {
  phone?: string | null;
  profileUrl?: string | null;
  employers?: (string | null | undefined)[];
}) {
  return {
    phoneKey: phoneKey(input.phone),
    profileKey: profileUrlKey(input.profileUrl),
    employerKeys: employerKeys(input.employers ?? []),
  };
}

export async function findDuplicates(
  tx: ScopedTx,
  query: DuplicateQuery,
): Promise<DuplicateMatch[]> {
  const email = normalizeEmail(query.email);
  const keys = matchKeys(query);
  const conditions = [
    ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
    ...(keys.phoneKey ? [{ phoneKey: keys.phoneKey }] : []),
    ...(keys.profileKey ? [{ profileKey: keys.profileKey }] : []),
    ...(query.fullName && keys.employerKeys.length
      ? [{ employerKeys: { hasSome: keys.employerKeys } }]
      : []),
  ];
  if (conditions.length === 0) return [];

  const rows = await tx.candidate.findMany({
    where: {
      status: 'active',
      mergedIntoId: null,
      ...(query.excludeId ? { id: { not: query.excludeId } } : {}),
      OR: conditions,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      currentTitle: true,
      phone: true,
      phoneKey: true,
      profileKey: true,
      employerKeys: true,
    },
    take: 200,
  });

  const matches: DuplicateMatch[] = [];
  for (const row of rows) {
    const reasons: DuplicateReason[] = [];
    if (email && row.email && normalizeEmail(row.email) === email) reasons.push('email');
    if (keys.phoneKey && row.phoneKey === keys.phoneKey) reasons.push('phone');
    if (keys.profileKey && row.profileKey === keys.profileKey) reasons.push('profile_url');
    let nameScore: number | null = null;
    if (query.fullName && row.employerKeys.some((k) => keys.employerKeys.includes(k))) {
      const score = nameSimilarity(query.fullName, row.fullName);
      if (score >= NAME_MATCH_THRESHOLD) {
        reasons.push('name_employer');
        nameScore = score;
      }
    }
    if (reasons.length === 0) continue;
    matches.push({
      candidateId: row.id,
      fullName: row.fullName,
      email: row.email,
      currentTitle: row.currentTitle,
      strength: reasons.some((r) => r !== 'name_employer') ? 'exact' : 'possible',
      reasons,
      nameScore,
    });
  }
  return matches.sort(
    (a, b) =>
      Number(b.strength === 'exact') - Number(a.strength === 'exact') ||
      (b.nameScore ?? 0) - (a.nameScore ?? 0) ||
      a.fullName.localeCompare(b.fullName),
  );
}

/**
 * The duplicates of a candidate being added. The query uses what is known so far: the stored
 * fields, overridden by the newest profile draft (name, email, phone and employers come from it).
 */
export async function duplicatesForCandidate(
  tx: ScopedTx,
  candidateId: string,
): Promise<DuplicateMatch[]> {
  const candidate = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, fullName: true, email: true, phone: true, profileUrl: true, status: true },
  });
  if (!candidate || candidate.status === 'discarded') throw notFound('Candidate');

  const query: DuplicateQuery = {
    excludeId: candidate.id,
    fullName: candidate.status === 'draft' ? null : candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    profileUrl: candidate.profileUrl,
    employers: [],
  };
  const artifact = await findArtifact(tx, {
    kind: 'candidate_profile',
    subject: { type: 'candidate', id: candidateId },
  });
  const latest = artifact
    ? (await getArtifactWithVersions(tx, artifact.id)).versions.find(
        (v) => v.status !== 'discarded',
      )
    : undefined;
  const profile = latest ? candidateProfileContentSchema.safeParse(latest.content) : null;
  if (profile?.success) {
    const p = profile.data;
    query.fullName = p.fullName ?? query.fullName;
    query.email = p.email ?? query.email;
    query.phone = p.phone ?? query.phone;
    query.employers = [p.currentPosition.company, ...p.careerHistory.map((c) => c.company)];
  }
  return findDuplicates(tx, query);
}
