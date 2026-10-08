// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  CLOSED_INTERVIEW_STATUSES,
  FEEDBACK_CRITERIA,
  type AgencyActor,
  type CreateInterviewInput,
  type FeedbackCriterion,
  type RecordFeedbackInput,
  type UpdateInterviewInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { requireEntry, transitionEntry } from '@/server/pipeline/service';
import { refreshStatusShares } from '@/server/portal/status-snapshot';

export interface FeedbackView {
  id: string;
  fromRole: string;
  source: string;
  ratings: Partial<Record<FeedbackCriterion, string>>;
  comments: string | null;
  createdAt: Date;
}

export interface InterviewView {
  id: string;
  roundName: string;
  scheduledAt: Date | null;
  format: string | null;
  interviewers: string[];
  status: string;
  feedback: FeedbackView[];
}

/** Interviews happen after submission. A candidate on hold or in the first round is still in play. */
const INTERVIEW_STATES = ['submitted', 'interviewing', 'on_hold', 'offer'];

const feedbackSelect = {
  id: true,
  fromRole: true,
  source: true,
  technicalFit: true,
  leadershipFit: true,
  communication: true,
  culturalFit: true,
  industryExperience: true,
  comments: true,
  createdAt: true,
} as const;

function toView(row: {
  id: string;
  roundName: string;
  scheduledAt: Date | null;
  format: string | null;
  interviewers: string[];
  status: string;
  feedback: ({
    id: string;
    fromRole: string;
    source: string;
    comments: string | null;
    createdAt: Date;
  } & Record<FeedbackCriterion, string | null>)[];
}): InterviewView {
  return {
    id: row.id,
    roundName: row.roundName,
    scheduledAt: row.scheduledAt,
    format: row.format,
    interviewers: row.interviewers,
    status: row.status,
    feedback: row.feedback.map((f) => ({
      id: f.id,
      fromRole: f.fromRole,
      source: f.source,
      comments: f.comments,
      createdAt: f.createdAt,
      ratings: Object.fromEntries(
        FEEDBACK_CRITERIA.flatMap((k) => (f[k] ? [[k, f[k]]] : [])),
      ) as FeedbackView['ratings'],
    })),
  };
}

const include = { feedback: { select: feedbackSelect, orderBy: { createdAt: 'asc' } } } as const;

export async function listInterviews(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<InterviewView[]> {
  await requireEntry(tx, actor, entryId, 'read');
  const rows = await tx.interview.findMany({
    where: { entryId },
    orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    include,
  });
  return rows.map(toView);
}

/** The reminder for a round that is still ahead: one open task per round (FR-IVW-01). */
async function syncTask(
  tx: ScopedTx,
  actor: AgencyActor,
  ownerId: string,
  interview: { id: string; scheduledAt: Date | null; status: string },
) {
  await tx.task.updateMany({
    where: {
      kind: 'interview',
      entityType: 'interview',
      entityId: interview.id,
      completedAt: null,
    },
    data: { completedAt: new Date() },
  });
  const open = interview.status === 'scheduled' && interview.scheduledAt;
  if (open) {
    await tx.task.create({
      data: {
        agencyId: actor.agencyId,
        ownerId,
        kind: 'interview',
        entityType: 'interview',
        entityId: interview.id,
        dueAt: interview.scheduledAt!,
      },
    });
  }
}

async function logRound(
  tx: ScopedTx,
  actor: AgencyActor,
  entry: { id: string; candidateId: string; positionId: string },
  action: string,
  data: Record<string, unknown>,
) {
  for (const [type, id] of [
    ['candidate', entry.candidateId],
    ['position', entry.positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action,
      entityType: type,
      entityId: id,
      data: { entryId: entry.id, ...data },
    });
  }
}

/**
 * Adds an interview round (T-9-01, US-901). Adding the first round to a submitted candidate moves
 * them to "interviewing"; a candidate on hold is put back in play. A round with a date gets a
 * reminder task for the entry's owner.
 */
export async function createInterview(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: CreateInterviewInput,
): Promise<InterviewView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (!INTERVIEW_STATES.includes(entry.state)) {
    throw new ApiError('conflict', 'Submit the candidate before adding interview rounds', {
      status: 409,
    });
  }
  if (entry.state === 'submitted' || entry.state === 'on_hold') {
    await transitionEntry(tx, actor, entryId, { to: 'interviewing' });
  }
  const row = await tx.interview.create({
    data: {
      agencyId: actor.agencyId,
      entryId,
      roundName: input.roundName,
      scheduledAt: input.scheduledAt ?? null,
      format: input.format ?? null,
      interviewers: input.interviewers,
    },
    include,
  });
  await syncTask(tx, actor, entry.ownerId, row);
  await refreshStatusShares(tx, actor.agencyId, entry.candidateId);
  await logRound(tx, actor, entry, 'interview.added', {
    interviewId: row.id,
    roundName: row.roundName,
  });
  return toView(row);
}

async function requireInterview(tx: ScopedTx, entryId: string, interviewId: string) {
  const row = await tx.interview.findFirst({ where: { id: interviewId, entryId }, include });
  if (!row) throw notFound('Interview');
  return row;
}

/** Changes a round: its time, people, format or status. A finished round closes its reminder. */
export async function updateInterview(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  interviewId: string,
  input: UpdateInterviewInput,
): Promise<InterviewView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  const current = await requireInterview(tx, entryId, interviewId);
  const row = await tx.interview.update({
    where: { id: current.id },
    data: {
      ...(input.roundName !== undefined ? { roundName: input.roundName } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      ...(input.interviewers !== undefined ? { interviewers: input.interviewers } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    include,
  });
  await syncTask(tx, actor, entry.ownerId, row);
  if (input.status && input.status !== current.status) {
    await refreshStatusShares(tx, actor.agencyId, entry.candidateId);
    await logRound(tx, actor, entry, 'interview.status_changed', {
      interviewId: row.id,
      status: row.status,
      closed: CLOSED_INTERVIEW_STATUSES.includes(row.status as 'completed'),
    });
  }
  return toView(row);
}

/**
 * Records feedback for a round (T-9-01, US-902, FR-IVW-03): the hiring manager's, entered by the
 * recruiter, or the candidate's, kept apart. Each rating is Strong, Moderate or Gap.
 */
export async function recordFeedback(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  interviewId: string,
  input: RecordFeedbackInput,
): Promise<InterviewView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  const interview = await requireInterview(tx, entryId, interviewId);
  await tx.interviewFeedback.create({
    data: {
      agencyId: actor.agencyId,
      interviewId: interview.id,
      fromRole: input.fromRole,
      source: 'recorded_by_recruiter',
      comments: input.comments ?? null,
      ...Object.fromEntries(FEEDBACK_CRITERIA.map((k) => [k, input.ratings[k] ?? null])),
    },
  });
  await logRound(tx, actor, entry, 'interview.feedback_recorded', {
    interviewId,
    fromRole: input.fromRole,
  });
  return toView(await requireInterview(tx, entryId, interviewId));
}
