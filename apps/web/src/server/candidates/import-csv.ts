// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  candidateProfileContentSchema,
  normalizeEmail,
  type AgencyActor,
  type ImportOutcome,
  type ImportRequest,
  type ImportRow,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { logActivity } from '@/server/activity/service';
import { approveVersion, addDraftVersion, findOrCreateArtifact } from '@/server/artifacts/service';
import { findDuplicates, matchKeys } from './duplicates';

/** The profile a row amounts to: only what the file says, everything else empty (never guessed). */
function profileOf(row: ImportRow) {
  const company = row.currentCompany?.trim() || null;
  const title = row.currentTitle?.trim() || null;
  return candidateProfileContentSchema.parse({
    fullName: row.fullName,
    email: row.email?.trim() || null,
    phone: row.phone?.trim() || null,
    currentPosition: { title, company },
    careerHistory:
      title || company
        ? [
            {
              company: company ?? '',
              title: title ?? '',
              start: null,
              end: null,
              current: true,
              summary: '',
            },
          ]
        : [],
    education: [],
    coreSkills: row.skills,
    industryExperience: [],
    technicalSkills: [],
    leadershipExperience: null,
    teamSize: null,
    careerProgression: null,
    majorAchievements: [],
    location: row.location?.trim() || null,
    workAuthorization: null,
    compensationExpectation: null,
    potentialMotivation: null,
    potentialConcerns: [],
  });
}

/**
 * Imports one batch of candidates from a CSV (T-2-15, Q-10). Each row becomes an ACTIVE candidate whose
 * profile is written by the recruiter who imports it (origin: human, approved in the same step), so
 * lists, search and duplicate checks work at once; nothing here is AI output. A row that matches
 * someone already in the agency by email, phone or profile link (or a name with the same employer) is
 * skipped and reported, never merged or overwritten. An address that opted out earlier stays
 * do-not-contact. Matching analysis still needs a fuller profile from a resume.
 */
export async function importCandidateRows(
  tx: ScopedTx,
  actor: AgencyActor,
  request: ImportRequest,
  now: Date = new Date(),
): Promise<ImportOutcome[]> {
  const emails = request.rows.map((r) => normalizeEmail(r.email)).filter((e): e is string => !!e);
  const optedOut = new Set(
    emails.length
      ? (
          await tx.suppression.findMany({
            where: { address: { in: emails } },
            select: { address: true },
          })
        ).map((s) => s.address)
      : [],
  );
  const outcomes: ImportOutcome[] = [];
  for (const [index, row] of request.rows.entries()) {
    const profileUrl = row.profileUrl?.trim() || null;
    const email = normalizeEmail(row.email);
    const duplicates = await findDuplicates(tx, {
      fullName: row.fullName,
      email,
      phone: row.phone,
      profileUrl,
      employers: [row.currentCompany],
    });
    const found = duplicates[0];
    if (found) {
      outcomes.push({
        index,
        status: 'duplicate',
        candidateId: found.candidateId,
        reasons: found.reasons,
      });
      continue;
    }
    const candidate = await tx.candidate.create({
      data: {
        agencyId: actor.agencyId,
        fullName: row.fullName,
        source: request.source,
        profileUrl,
        tags: row.tags,
        status: 'active',
        createdById: actor.userId,
        ...matchKeys({ phone: row.phone, profileUrl, employers: [row.currentCompany] }),
        ...(email && optedOut.has(email)
          ? {
              doNotContact: true,
              doNotContactReason: 'Opted out of our email earlier',
              doNotContactAt: now,
            }
          : {}),
      },
      select: { id: true },
    });
    const artifact = await findOrCreateArtifact(tx, {
      agencyId: actor.agencyId,
      kind: 'candidate_profile',
      subject: { type: 'candidate', id: candidate.id },
    });
    const version = await addDraftVersion(tx, {
      agencyId: actor.agencyId,
      artifactId: artifact.id,
      content: profileOf(row),
      origin: 'human',
      createdById: actor.userId,
    });
    await approveVersion(tx, actor, version.id);
    // The profile has no field for total years; the file's number goes on the candidate directly.
    if (row.yearsExperience != null) {
      await tx.candidate.update({
        where: { id: candidate.id },
        data: { yearsExperience: row.yearsExperience },
      });
    }
    if (row.notes) {
      await tx.candidateNote.create({
        data: {
          agencyId: actor.agencyId,
          candidateId: candidate.id,
          authorId: actor.userId,
          body: row.notes,
        },
      });
    }
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'candidate.imported',
      entityType: 'candidate',
      entityId: candidate.id,
      data: { source: request.source, via: 'csv' },
    });
    outcomes.push({ index, status: 'created', candidateId: candidate.id });
  }
  return outcomes;
}
