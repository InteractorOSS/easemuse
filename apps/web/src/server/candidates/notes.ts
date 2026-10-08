// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, CandidateNoteInput, CandidateTagsInput } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { forbidden, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';

export interface NoteView {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The viewer wrote it, or is an admin: may edit or delete (admins delete only). */
  canEdit: boolean;
  canDelete: boolean;
}

async function requireCandidate(tx: ScopedTx, candidateId: string) {
  const row = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, status: true, tags: true },
  });
  if (!row || row.status === 'discarded') throw notFound('Candidate');
  return row;
}

/**
 * Replaces the candidate's tags (FR-SRC-09). Any member can tag; the list is cleaned (lowercase,
 * no repeats) by the input schema, and the change goes on the timeline.
 */
export async function setTags(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  input: CandidateTagsInput,
): Promise<{ tags: string[] }> {
  const before = await requireCandidate(tx, candidateId);
  const row = await tx.candidate.update({
    where: { id: candidateId },
    data: { tags: input.tags },
    select: { tags: true },
  });
  const added = row.tags.filter((t) => !before.tags.includes(t));
  const removed = before.tags.filter((t) => !row.tags.includes(t));
  if (added.length > 0 || removed.length > 0) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'candidate.tags_changed',
      entityType: 'candidate',
      entityId: candidateId,
      data: { added, removed },
    });
  }
  return { tags: row.tags };
}

async function toViews(
  tx: ScopedTx,
  actor: AgencyActor,
  rows: { id: string; body: string; authorId: string; createdAt: Date; updatedAt: Date }[],
): Promise<NoteView[]> {
  const ids = [...new Set(rows.map((r) => r.authorId))];
  const users = ids.length
    ? await tx.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  return rows.map((r) => ({
    ...r,
    authorName: names.get(r.authorId) ?? null,
    canEdit: r.authorId === actor.userId,
    canDelete: r.authorId === actor.userId || actor.role === 'admin',
  }));
}

/** The notes on one candidate, newest first. Any member of the agency can read them. */
export async function listNotes(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
): Promise<NoteView[]> {
  await requireCandidate(tx, candidateId);
  const rows = await tx.candidateNote.findMany({
    where: { candidateId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return toViews(tx, actor, rows);
}

export async function addNote(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  input: CandidateNoteInput,
): Promise<NoteView> {
  await requireCandidate(tx, candidateId);
  const row = await tx.candidateNote.create({
    data: { agencyId: actor.agencyId, candidateId, authorId: actor.userId, body: input.body },
  });
  // The timeline records that a note was added, never what it says.
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'candidate.note_added',
    entityType: 'candidate',
    entityId: candidateId,
    data: { noteId: row.id },
  });
  return (await toViews(tx, actor, [row]))[0]!;
}

async function requireNote(tx: ScopedTx, candidateId: string, noteId: string) {
  const row = await tx.candidateNote.findFirst({ where: { id: noteId, candidateId } });
  if (!row) throw notFound('Note');
  return row;
}

/** Only the author edits a note. */
export async function updateNote(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  noteId: string,
  input: CandidateNoteInput,
): Promise<NoteView> {
  const note = await requireNote(tx, candidateId, noteId);
  if (note.authorId !== actor.userId) throw forbidden('Only the author can change a note');
  const row = await tx.candidateNote.update({ where: { id: noteId }, data: { body: input.body } });
  return (await toViews(tx, actor, [row]))[0]!;
}

/** The author deletes their own note; an admin can delete any. */
export async function deleteNote(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  noteId: string,
): Promise<void> {
  const note = await requireNote(tx, candidateId, noteId);
  if (note.authorId !== actor.userId && actor.role !== 'admin') {
    throw forbidden('Only the author or an admin can delete a note');
  }
  await tx.candidateNote.delete({ where: { id: noteId } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'candidate.note_deleted',
    entityType: 'candidate',
    entityId: candidateId,
    data: { noteId },
  });
}
