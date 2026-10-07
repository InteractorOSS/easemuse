// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { MAX_SNOOZE_DAYS, type AgencyActor, type TaskKind, type TaskScope } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';

/**
 * The task engine (T-0-01, US-006): reminders for the recruiter, such as "touch 2 is due" or "an
 * interview is tomorrow". Features create tasks; people complete or snooze their own. Tasks never act
 * for the recruiter: nothing is sent or changed when one comes due (brief §1.1).
 */
export interface TaskView {
  id: string;
  kind: string;
  entityType: string;
  entityId: string;
  /** Human-readable name of what the task is about (position title, candidate name...), when known. */
  entityLabel: string | null;
  dueAt: Date;
  snoozedUntil: Date | null;
  overdue: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
/** Start of the UTC day containing `now`. */
const startOfDay = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export async function createTask(
  tx: ScopedTx,
  input: {
    agencyId: string;
    ownerId: string;
    kind: TaskKind;
    entityType: string;
    entityId: string;
    dueAt: Date;
  },
): Promise<{ id: string; created: boolean }> {
  // One open task per owner, kind and entity: creating it again returns the one that exists.
  const open = await tx.task.findFirst({
    where: {
      ownerId: input.ownerId,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      completedAt: null,
    },
    select: { id: true },
  });
  if (open) return { id: open.id, created: false };
  const row = await tx.task.create({ data: input, select: { id: true } });
  return { id: row.id, created: true };
}

async function ownTask(tx: ScopedTx, actor: AgencyActor, taskId: string) {
  // Someone else's task is simply not found: a task list is personal.
  const task = await tx.task.findFirst({ where: { id: taskId, ownerId: actor.userId } });
  if (!task) throw notFound('Task');
  return task;
}

export async function completeTask(
  tx: ScopedTx,
  actor: AgencyActor,
  taskId: string,
  now: Date = new Date(),
): Promise<void> {
  const task = await ownTask(tx, actor, taskId);
  if (task.completedAt) return; // already done: completing twice is harmless
  await tx.task.update({ where: { id: task.id }, data: { completedAt: now } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'task.completed',
    entityType: task.entityType,
    entityId: task.entityId,
    data: { kind: task.kind },
  });
}

export async function snoozeTask(
  tx: ScopedTx,
  actor: AgencyActor,
  taskId: string,
  until: Date,
  now: Date = new Date(),
): Promise<void> {
  if (until <= now || until.getTime() - now.getTime() > MAX_SNOOZE_DAYS * DAY) {
    throw new ApiError(
      'invalid_input',
      `Snooze until a time within the next ${MAX_SNOOZE_DAYS} days`,
      { status: 422, fields: { until: 'Out of range' } },
    );
  }
  const task = await ownTask(tx, actor, taskId);
  if (task.completedAt)
    throw new ApiError('conflict', 'This task is already done', { status: 409 });
  await tx.task.update({ where: { id: task.id }, data: { snoozedUntil: until } });
}

/**
 * The person's open tasks. `today` is everything due by the end of today (UTC) that is not snoozed,
 * overdue ones first; `upcoming` is later; `all` is every open task, snoozed ones included.
 */
export async function listTasks(
  tx: ScopedTx,
  actor: AgencyActor,
  scope: TaskScope,
  now: Date = new Date(),
): Promise<TaskView[]> {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY);
  const awake = { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  const rows = await tx.task.findMany({
    where: {
      ownerId: actor.userId,
      completedAt: null,
      ...(scope === 'today'
        ? { dueAt: { lt: tomorrow }, ...awake }
        : scope === 'upcoming'
          ? { dueAt: { gte: tomorrow }, ...awake }
          : {}),
    },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    take: 200,
  });
  const labels = await entityLabels(tx, rows);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    entityType: r.entityType,
    entityId: r.entityId,
    entityLabel: labels.get(`${r.entityType}:${r.entityId}`) ?? null,
    dueAt: r.dueAt,
    snoozedUntil: r.snoozedUntil,
    overdue: r.dueAt < today,
  }));
}

/** Names for the entities tasks point at, looked up in a few batched queries. */
async function entityLabels(
  tx: ScopedTx,
  tasks: { entityType: string; entityId: string }[],
): Promise<Map<string, string>> {
  const ids = (type: string) => [
    ...new Set(tasks.filter((t) => t.entityType === type).map((t) => t.entityId)),
  ];
  const labels = new Map<string, string>();
  const [positions, candidates, entries] = await Promise.all([
    ids('position').length
      ? tx.position.findMany({
          where: { id: { in: ids('position') } },
          select: { id: true, title: true },
        })
      : [],
    ids('candidate').length
      ? tx.candidate.findMany({
          where: { id: { in: ids('candidate') } },
          select: { id: true, fullName: true },
        })
      : [],
    ids('pipeline_entry').length
      ? tx.pipelineEntry.findMany({
          where: { id: { in: ids('pipeline_entry') } },
          select: {
            id: true,
            candidate: { select: { fullName: true } },
            position: { select: { title: true } },
          },
        })
      : [],
  ]);
  for (const p of positions) labels.set(`position:${p.id}`, p.title);
  for (const c of candidates) labels.set(`candidate:${c.id}`, c.fullName);
  for (const e of entries)
    labels.set(`pipeline_entry:${e.id}`, `${e.candidate.fullName}: ${e.position.title}`);
  return labels;
}
