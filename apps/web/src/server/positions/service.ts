// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  POSITION_TRANSITIONS,
  REASON_REQUIRED,
  type AgencyActor,
  type PositionInput,
  type PositionPatch,
  type PositionStatus,
  type GuardOverride,
  type PositionStatusInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { decodeCursor, toPage } from '@/lib/http/pagination';
import { logActivity } from '@/server/activity/service';
import { applyGuards } from '@/server/guards';
import { getAgencySettings } from '@/server/tenancy/settings';
import { recomputePositionScores } from '@/server/matching/scoring';
import { isJdApproved } from './jd-approval';

/**
 * Positions (T-1-03) and their status (T-1-14). Every status change goes through `changeStatus`,
 * which writes a `PositionTransition` row (Time-to-Fill and positions per recruiter come from them).
 */
export interface PositionView {
  id: string;
  clientId: string;
  clientName: string;
  ownerId: string;
  ownerName: string | null;
  hiringManagerId: string | null;
  status: PositionStatus;
  title: string;
  department: string | null;
  reportingLine: string | null;
  location: string;
  workArrangement: string | null;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string;
  requiredExperience: string | null;
  requiredSkills: string[];
  hiringTimeline: string | null;
  openings: number;
  workAuthorization: string | null;
  matchingWeights: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const select = {
  id: true,
  clientId: true,
  ownerId: true,
  hiringManagerId: true,
  status: true,
  title: true,
  department: true,
  reportingLine: true,
  location: true,
  workArrangement: true,
  compMin: true,
  compMax: true,
  compCurrency: true,
  requiredExperience: true,
  requiredSkills: true,
  hiringTimeline: true,
  openings: true,
  workAuthorization: true,
  matchingWeights: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { name: true } },
} satisfies Prisma.PositionSelect;
type Row = Prisma.PositionGetPayload<{ select: typeof select }>;

async function toViews(tx: ScopedTx, rows: Row[]): Promise<PositionView[]> {
  const ids = [...new Set(rows.map((r) => r.ownerId))];
  const users = ids.length
    ? await tx.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  return rows.map(({ client, compMin, compMax, ...r }) => ({
    ...r,
    clientName: client.name,
    ownerName: names.get(r.ownerId) ?? null,
    compMin: compMin === null ? null : Number(compMin),
    compMax: compMax === null ? null : Number(compMax),
  }));
}

/** Moves out of draft or intake into these need the JD approved. */
const LEAVES_PREPARATION: PositionStatus[] = ['sourcing', 'interviewing', 'offer', 'filled'];

const isManager = (actor: AgencyActor) => actor.role === 'admin' || actor.role === 'lead';

/**
 * With the agency rule "own and shared", a recruiter sees only the positions they own. Exported so
 * features that read across positions (analytics, the client history, the pattern reports) apply
 * exactly the same rule and never show more than the positions list does.
 */
export async function visibilityFilter(
  tx: ScopedTx,
  actor: AgencyActor,
): Promise<Prisma.PositionWhereInput> {
  if (isManager(actor)) return {};
  const { visibility } = await getAgencySettings(tx, actor.agencyId);
  return visibility === 'own_and_shared' ? { ownerId: actor.userId } : {};
}

async function assertActiveMember(tx: ScopedTx, userId: string, field: string) {
  const member = await tx.membership.findFirst({
    where: { userId, active: true },
    select: { id: true },
  });
  if (!member)
    throw new ApiError('invalid_input', 'That person is not a member of this agency', {
      status: 422,
      fields: { [field]: 'Not a member' },
    });
}

async function assertContact(tx: ScopedTx, clientId: string, contactId: string) {
  const c = await tx.clientContact.findFirst({
    where: { id: contactId, clientId },
    select: { id: true },
  });
  if (!c)
    throw new ApiError('invalid_input', 'That contact does not belong to this client', {
      status: 422,
      fields: { hiringManagerId: 'Not a contact of this client' },
    });
}

export async function listPositions(
  tx: ScopedTx,
  actor: AgencyActor,
  input: {
    limit: number;
    cursor?: string;
    status?: PositionStatus;
    clientId?: string;
    ownerId?: string;
    q?: string;
  },
): Promise<{ items: PositionView[]; nextCursor: string | null }> {
  const key = input.cursor ? decodeCursor(input.cursor) : undefined;
  const at = key ? new Date(key.v) : undefined;
  const rows = await tx.position.findMany({
    where: {
      AND: [
        await visibilityFilter(tx, actor),
        {
          ...(input.status ? { status: input.status } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(input.ownerId ? { ownerId: input.ownerId } : {}),
          ...(input.q ? { title: { contains: input.q, mode: 'insensitive' } } : {}),
        },
        key && at ? { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: key.id } }] } : {},
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
    select,
  });
  const page = toPage(rows, input.limit, (r) => ({ v: r.createdAt.toISOString(), id: r.id }));
  return { items: await toViews(tx, page.items), nextCursor: page.nextCursor };
}

export interface PositionBrief {
  id: string;
  title: string;
  location: string;
  department: string | null;
  workArrangement: string | null;
  status: PositionStatus;
  compMin: number | null;
  compMax: number | null;
  compCurrency: string;
  requiredExperience: string | null;
  requiredSkills: string[];
  clientId: string;
  createdAt: Date;
}

/**
 * Positions the actor may see (the agency's visibility rule applies), newest first, for features
 * that read across positions: the benchmark's own data and "Check open positions".
 */
export async function findVisiblePositions(
  tx: ScopedTx,
  actor: AgencyActor,
  where: Prisma.PositionWhereInput,
  take: number,
): Promise<PositionBrief[]> {
  const rows = await tx.position.findMany({
    where: { AND: [await visibilityFilter(tx, actor), where] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: {
      id: true,
      title: true,
      location: true,
      department: true,
      workArrangement: true,
      status: true,
      compMin: true,
      compMax: true,
      compCurrency: true,
      requiredExperience: true,
      requiredSkills: true,
      clientId: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    status: r.status as PositionStatus,
    compMin: r.compMin === null ? null : Number(r.compMin),
    compMax: r.compMax === null ? null : Number(r.compMax),
  }));
}

/** Loads a position the actor may see; one they may not see is a 404, like one that does not exist. */
async function load(tx: ScopedTx, actor: AgencyActor, positionId: string): Promise<Row> {
  const row = await tx.position.findFirst({
    where: { AND: [{ id: positionId }, await visibilityFilter(tx, actor)] },
    select,
  });
  if (!row) throw notFound('Position');
  return row;
}

/** Editing and status changes: the owner, leads and admins. */
function assertCanEdit(actor: AgencyActor, row: { ownerId: string }) {
  if (!isManager(actor) && row.ownerId !== actor.userId)
    throw forbidden('Only the owner, a lead or an admin can change this position');
}

/** For features that attach to a position: loads it as `read` (anyone who can see it) or `edit` (owner, lead, admin). */
export async function requirePosition(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  mode: 'read' | 'edit',
): Promise<{ id: string; clientId: string; ownerId: string; status: PositionStatus }> {
  const row = await load(tx, actor, positionId);
  if (mode === 'edit') assertCanEdit(actor, row);
  return {
    id: row.id,
    clientId: row.clientId,
    ownerId: row.ownerId,
    status: row.status as PositionStatus,
  };
}

export async function getPosition(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<PositionView> {
  return (await toViews(tx, [await load(tx, actor, positionId)]))[0]!;
}

export async function createPosition(
  tx: ScopedTx,
  actor: AgencyActor,
  input: PositionInput,
): Promise<PositionView> {
  const client = await tx.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, archivedAt: true },
  });
  if (!client)
    throw new ApiError('invalid_input', 'Unknown client', {
      status: 422,
      fields: { clientId: 'Unknown client' },
    });
  if (client.archivedAt)
    throw new ApiError('invalid_input', 'This client is archived', {
      status: 422,
      fields: { clientId: 'Client is archived' },
    });
  if (input.hiringManagerId) await assertContact(tx, input.clientId, input.hiringManagerId);
  let ownerId = actor.userId;
  if (input.ownerId && input.ownerId !== actor.userId) {
    if (!isManager(actor)) throw forbidden('Only a lead or an admin can assign another owner');
    await assertActiveMember(tx, input.ownerId, 'ownerId');
    ownerId = input.ownerId;
  }
  const weights =
    input.matchingWeights ?? (await getAgencySettings(tx, actor.agencyId)).defaultMatchingWeights;
  const row = await tx.position.create({
    data: {
      agencyId: actor.agencyId,
      clientId: input.clientId,
      ownerId,
      hiringManagerId: input.hiringManagerId ?? null,
      title: input.title,
      location: input.location,
      department: input.department ?? null,
      reportingLine: input.reportingLine ?? null,
      workArrangement: input.workArrangement ?? null,
      compMin: input.compMin ?? null,
      compMax: input.compMax ?? null,
      ...(input.compCurrency ? { compCurrency: input.compCurrency } : {}),
      requiredExperience: input.requiredExperience ?? null,
      requiredSkills: input.requiredSkills ?? [],
      hiringTimeline: input.hiringTimeline ?? null,
      ...(input.openings ? { openings: input.openings } : {}),
      workAuthorization: input.workAuthorization ?? null,
      matchingWeights: weights,
    },
    select,
  });
  await tx.positionTransition.create({
    data: {
      agencyId: actor.agencyId,
      positionId: row.id,
      fromStatus: null,
      toStatus: 'draft',
      actorId: actor.userId,
    },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'position.created',
    entityType: 'position',
    entityId: row.id,
  });
  return (await toViews(tx, [row]))[0]!;
}

export async function updatePosition(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  patch: PositionPatch,
): Promise<PositionView> {
  const current = await load(tx, actor, positionId);
  assertCanEdit(actor, current);
  const compMin =
    patch.compMin !== undefined
      ? patch.compMin
      : current.compMin === null
        ? null
        : Number(current.compMin);
  const compMax =
    patch.compMax !== undefined
      ? patch.compMax
      : current.compMax === null
        ? null
        : Number(current.compMax);
  if (compMin !== null && compMax !== null && compMin > compMax) {
    throw new ApiError('invalid_input', 'The minimum cannot be above the maximum', {
      status: 422,
      fields: { compMax: 'The minimum cannot be above the maximum' },
    });
  }
  if (patch.hiringManagerId) await assertContact(tx, current.clientId, patch.hiringManagerId);
  if (patch.ownerId && patch.ownerId !== current.ownerId) {
    if (!isManager(actor)) throw forbidden('Only a lead or an admin can reassign the owner');
    await assertActiveMember(tx, patch.ownerId, 'ownerId');
  }
  const { matchingWeights, ...rest } = patch;
  const row = await tx.position.update({
    where: { id: positionId },
    data: { ...rest, ...(matchingWeights ? { matchingWeights } : {}) },
    select,
  });
  // New weights change every overall score of the position at once, with no new analysis (ADR-007).
  if (matchingWeights) await recomputePositionScores(tx, positionId, matchingWeights);
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'position.updated',
    entityType: 'position',
    entityId: positionId,
    data: {
      fields: Object.keys(patch),
      // Weights change how candidates are ranked, so the old and new values are kept (T-1-13).
      ...(matchingWeights
        ? { weights: { from: current.matchingWeights, to: matchingWeights } }
        : {}),
    },
  });
  return (await toViews(tx, [row]))[0]!;
}

/**
 * Moves a position to a new status if the move is allowed, and records it. A hold or cancellation
 * needs a reason. A held position can only resume where it was, or be cancelled.
 */
export async function changeStatus(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  input: PositionStatusInput,
): Promise<PositionView> {
  const current = await load(tx, actor, positionId);
  assertCanEdit(actor, current);
  const from = current.status as PositionStatus;
  if (!POSITION_TRANSITIONS[from].includes(input.status)) {
    throw new ApiError(
      'invalid_transition',
      `A ${from.replace('_', ' ')} position cannot move to ${input.status.replace('_', ' ')}`,
      { status: 409 },
    );
  }
  if (REASON_REQUIRED.includes(input.status) && !input.reason) {
    throw new ApiError('invalid_input', 'A reason is required', {
      status: 422,
      fields: { reason: 'Enter a reason' },
    });
  }
  if (from === 'on_hold' && input.status !== 'cancelled') {
    const before = await tx.positionTransition.findFirst({
      where: { positionId, toStatus: 'on_hold' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { fromStatus: true },
    });
    if (before?.fromStatus && before.fromStatus !== input.status) {
      throw new ApiError(
        'invalid_transition',
        `This position was ${before.fromStatus} before the hold; resume there or cancel`,
        { status: 409 },
      );
    }
  }
  // Leaving the preparation phase needs the hiring manager's approval of the JD (guard jdApproval).
  let overridden: GuardOverride[] = [];
  if (LEAVES_PREPARATION.includes(input.status) && (from === 'draft' || from === 'intake')) {
    if (!(await isJdApproved(tx, positionId))) {
      const { guardModes } = await getAgencySettings(tx, actor.agencyId);
      overridden = applyGuards(
        [
          {
            guard: 'jdApproval',
            message: 'The hiring manager has not approved the job description.',
          },
        ],
        guardModes,
        input.overrideGuards,
      );
    }
  }
  const row = await tx.position.update({
    where: { id: positionId },
    data: { status: input.status },
    select,
  });
  await tx.positionTransition.create({
    data: {
      agencyId: actor.agencyId,
      positionId,
      fromStatus: from,
      toStatus: input.status,
      actorId: actor.userId,
      reason: input.reason ?? null,
    },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'position.status_changed',
    entityType: 'position',
    entityId: positionId,
    data: {
      from,
      to: input.status,
      ...(overridden.length ? { overriddenGuards: overridden } : {}),
    },
  });
  return (await toViews(tx, [row]))[0]!;
}
