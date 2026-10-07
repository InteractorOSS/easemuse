// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  PRIVACY_DEADLINE_DAYS,
  PRIVACY_REMINDER_DAYS,
  type AgencyActor,
  type CreatePrivacyRequestInput,
  type PrivacyKind,
  type PrivacyStatus,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';

const DAY_MS = 86_400_000;

export interface PrivacyRequestView {
  id: string;
  candidateId: string;
  candidateName: string;
  kind: PrivacyKind;
  status: PrivacyStatus;
  source: string;
  note: string | null;
  requestedAt: Date;
  deadlineAt: Date;
  completedAt: Date | null;
  decisionNote: string | null;
  /** The finished export, for a download link. */
  fileId: string | null;
  /** Past the deadline and still open. */
  overdue: boolean;
}

function assertManager(actor: AgencyActor): void {
  if (actor.role !== 'admin' && actor.role !== 'lead') {
    throw forbidden('Only a lead or an admin can handle privacy requests');
  }
}
function assertAdmin(actor: AgencyActor): void {
  if (actor.role !== 'admin') throw forbidden('Only an admin can carry out a privacy request');
}

type Row = {
  id: string;
  candidateId: string;
  kind: string;
  status: string;
  source: string;
  note: string | null;
  requestedAt: Date;
  deadlineAt: Date;
  completedAt: Date | null;
  decisionNote: string | null;
  fileId: string | null;
};

function toView(row: Row, candidateName: string, now: Date): PrivacyRequestView {
  const open = row.status === 'requested' || row.status === 'in_progress';
  return {
    id: row.id,
    candidateId: row.candidateId,
    candidateName,
    kind: row.kind as PrivacyKind,
    status: row.status as PrivacyStatus,
    source: row.source,
    note: row.note,
    requestedAt: row.requestedAt,
    deadlineAt: row.deadlineAt,
    completedAt: row.completedAt,
    decisionNote: row.decisionNote,
    fileId: row.fileId,
    overdue: open && row.deadlineAt.getTime() < now.getTime(),
  };
}

/**
 * Records a request the agency received (T-0-06, FR-PLT-08, FR-CDP-06): export or deletion of a
 * candidate's data. The deadline is set from the day it was recorded, and a reminder task falls due
 * a week before it. One open request of each kind per candidate.
 */
export async function createPrivacyRequest(
  tx: ScopedTx,
  actor: AgencyActor,
  input: CreatePrivacyRequestInput,
  now: Date = new Date(),
): Promise<PrivacyRequestView> {
  assertManager(actor);
  const candidate = await tx.candidate.findUnique({
    where: { id: input.candidateId },
    select: { fullName: true, anonymizedAt: true },
  });
  if (!candidate) throw notFound('Candidate');
  if (candidate.anonymizedAt) {
    throw new ApiError('conflict', 'This candidate was already deleted', { status: 409 });
  }
  const open = await tx.privacyRequest.findFirst({
    where: {
      candidateId: input.candidateId,
      kind: input.kind,
      status: { in: ['requested', 'in_progress'] },
    },
    select: { id: true },
  });
  if (open) {
    throw new ApiError(
      'conflict',
      'There is already an open request of this kind for the candidate',
      {
        status: 409,
      },
    );
  }
  const deadlineAt = new Date(now.getTime() + PRIVACY_DEADLINE_DAYS * DAY_MS);
  const row = await tx.privacyRequest.create({
    data: {
      agencyId: actor.agencyId,
      candidateId: input.candidateId,
      kind: input.kind,
      note: input.note ?? null,
      requestedAt: now,
      deadlineAt,
      requestedById: actor.userId,
    },
  });
  const reminder = new Date(deadlineAt.getTime() - PRIVACY_REMINDER_DAYS * DAY_MS);
  await tx.task.create({
    data: {
      agencyId: actor.agencyId,
      ownerId: actor.userId,
      kind: 'privacy_request',
      entityType: 'privacy_request',
      entityId: row.id,
      dueAt: reminder.getTime() > now.getTime() ? reminder : deadlineAt,
    },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: `privacy.${input.kind}_requested`,
    entityType: 'candidate',
    entityId: input.candidateId,
    data: { requestId: row.id, deadlineAt: deadlineAt.toISOString() },
  });
  return toView(row, candidate.fullName, now);
}

export async function listPrivacyRequests(
  tx: ScopedTx,
  actor: AgencyActor,
  now: Date = new Date(),
): Promise<PrivacyRequestView[]> {
  assertManager(actor);
  const rows = await tx.privacyRequest.findMany({
    orderBy: [{ deadlineAt: 'asc' }, { id: 'asc' }],
  });
  const names = new Map(
    (
      await tx.candidate.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.candidateId))] } },
        select: { id: true, fullName: true },
      })
    ).map((c) => [c.id, c.fullName]),
  );
  // Open requests first (by deadline), then the finished ones, newest first.
  const open = rows.filter((r) => r.status === 'requested' || r.status === 'in_progress');
  const done = rows.filter((r) => !open.includes(r)).reverse();
  return [...open, ...done].map((r) => toView(r, names.get(r.candidateId) ?? '', now));
}

async function loadRequest(tx: ScopedTx, id: string) {
  const row = await tx.privacyRequest.findUnique({ where: { id } });
  if (!row) throw notFound('Privacy request');
  return row;
}

/** Admin starts the work: the request moves to in progress and the caller queues the job. */
export async function beginPrivacyRequest(
  tx: ScopedTx,
  actor: AgencyActor,
  id: string,
): Promise<{ kind: PrivacyKind; candidateId: string }> {
  assertAdmin(actor);
  const row = await loadRequest(tx, id);
  if (row.status !== 'requested') {
    throw new ApiError('conflict', 'This request has already been started or closed', {
      status: 409,
    });
  }
  await tx.privacyRequest.update({
    where: { id },
    data: { status: 'in_progress', decidedById: actor.userId },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: `privacy.${row.kind}_started`,
    entityType: 'candidate',
    entityId: row.candidateId,
    data: { requestId: id },
  });
  return { kind: row.kind as PrivacyKind, candidateId: row.candidateId };
}

export async function attachJob(tx: ScopedTx, id: string, jobRunId: string): Promise<void> {
  await tx.privacyRequest.update({ where: { id }, data: { jobRunId } });
}

/** A request the agency will not carry out, with the reason kept (a lawful refusal is still a recorded decision). */
export async function rejectPrivacyRequest(
  tx: ScopedTx,
  actor: AgencyActor,
  id: string,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  assertAdmin(actor);
  const row = await loadRequest(tx, id);
  if (row.status !== 'requested') {
    throw new ApiError('conflict', 'This request has already been started or closed', {
      status: 409,
    });
  }
  await tx.privacyRequest.update({
    where: { id },
    data: { status: 'rejected', decisionNote: reason, decidedById: actor.userId, completedAt: now },
  });
  await closeTask(tx, id, now);
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'privacy.rejected',
    entityType: 'candidate',
    entityId: row.candidateId,
    data: { requestId: id },
  });
}

async function closeTask(tx: ScopedTx, id: string, now: Date): Promise<void> {
  await tx.task.updateMany({
    where: {
      kind: 'privacy_request',
      entityType: 'privacy_request',
      entityId: id,
      completedAt: null,
    },
    data: { completedAt: now },
  });
}

/** Called by the jobs when the work is done: closes the request and its reminder. */
export async function finishPrivacyRequest(
  tx: ScopedTx,
  id: string,
  result: { fileId?: string },
  now: Date = new Date(),
): Promise<void> {
  const row = await loadRequest(tx, id);
  await tx.privacyRequest.update({
    where: { id },
    data: {
      status: 'completed',
      completedAt: now,
      ...(result.fileId ? { fileId: result.fileId } : {}),
    },
  });
  await closeTask(tx, id, now);
  await logActivity(tx, {
    agencyId: row.agencyId,
    actor: { type: 'system' },
    action: `privacy.${row.kind}_completed`,
    entityType: 'candidate',
    entityId: row.candidateId,
    data: { requestId: id },
  });
}
