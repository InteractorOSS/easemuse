// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UnrecoverableError } from 'bullmq';
import type { Prisma } from '@prisma/client';
import {
  type PlatformAdminActor,
  type TenantDeletionConfirmInput,
  type TenantDeletionStatus,
} from '@easemuse/core';
import { dataRightsScope, getAgencyByRef, getPlatformUser, withUser, type Scope } from '@/lib/db';
import { enqueue } from '@/lib/queue';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { deleteObjects } from '@/server/privacy/anonymize';
import { getObjectStore, type ObjectStore } from '@/server/files/object-store';
import { recordPlatformAudit } from '@/server/platform/audit';
import type { JobContext } from '@/worker/registry';
import { TENANT_TABLES, quoteTable } from './tables';

/**
 * Tenant deletion (T-13-10, FR-ADM-08, FR-TEN-06, ADR-016). At contract end a platform owner or admin
 * asks for an agency to be deleted by typing its URL name; a DIFFERENT owner or admin approves by
 * typing it again; then a worker job removes the agency, table by table in dependency order (not a
 * cascade), then its stored files, the people who belong to no other agency, and finally the agency
 * row. The record of the deletion (who asked, who approved, how many rows) outlives the tenant.
 */

export interface TenantDeletionView {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  status: TenantDeletionStatus;
  requestedById: string;
  requestedByEmail: string | null;
  requestedAt: Date;
  approvedByEmail: string | null;
  approvedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  error: string | null;
  /** Rows removed so far (all tables), no content. */
  rowsRemoved: number;
}

/** What the job remembers between attempts, so a retry carries on instead of starting over. */
interface DeletionProgress {
  tables?: Record<string, number>;
  memberUserIds?: string[];
  objectsNotRemoved?: number;
  usersRemoved?: number;
}

const OPEN: TenantDeletionStatus[] = ['requested', 'approved', 'running'];
/** The job is tried this many times before the record is marked failed. */
export const TENANT_DELETION_ATTEMPTS = 3;

type Row = Awaited<ReturnType<Prisma.TransactionClient['tenantDeletion']['findFirstOrThrow']>>;

async function viewOf(row: Row): Promise<TenantDeletionView> {
  const [requester, approver] = await Promise.all([
    getPlatformUser(row.requestedById),
    row.approvedById ? getPlatformUser(row.approvedById) : null,
  ]);
  const progress = (row.counts ?? {}) as DeletionProgress;
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    tenantName: row.tenantName,
    status: row.status as TenantDeletionStatus,
    requestedById: row.requestedById,
    requestedByEmail: requester?.email ?? null,
    requestedAt: row.requestedAt,
    approvedByEmail: approver?.email ?? null,
    approvedAt: row.approvedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    error: row.error,
    rowsRemoved: Object.values(progress.tables ?? {}).reduce((sum, n) => sum + n, 0),
  };
}

function assertTypedSlug(slug: string, input: TenantDeletionConfirmInput): void {
  if (input.confirmSlug.trim().toLowerCase() !== slug) {
    throw new ApiError('invalid_input', 'Type the agency URL name exactly to confirm', {
      fields: { confirmSlug: 'This does not match the agency URL name' },
    });
  }
}

/** Only owners and admins delete tenants; `support` administrators never do. */
function assertCanDelete(actor: PlatformAdminActor): void {
  if (actor.role !== 'owner' && actor.role !== 'admin') throw forbidden();
}

/** Step 1: an owner or admin asks, typing the agency's URL name. The agency has to be suspended first. */
export async function requestTenantDeletion(
  actor: PlatformAdminActor,
  agencyRef: string,
  input: TenantDeletionConfirmInput,
): Promise<TenantDeletionView> {
  assertCanDelete(actor);
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  assertTypedSlug(agency.slug, input);
  if (agency.status !== 'suspended' && agency.status !== 'closed') {
    throw new ApiError('conflict', 'Suspend the agency first, then ask for its deletion', {
      status: 409,
    });
  }
  const row = await withUser(actor.userId, async (tx) => {
    const open = await tx.tenantDeletion.findFirst({
      where: { tenantId: agency.id, status: { in: OPEN } },
    });
    if (open) {
      throw new ApiError('conflict', 'A deletion of this agency is already under way', {
        status: 409,
      });
    }
    const created = await tx.tenantDeletion.create({
      data: {
        tenantId: agency.id,
        tenantSlug: agency.slug,
        tenantName: agency.name,
        requestedById: actor.userId,
      },
    });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'tenant.deletion.request',
      agencyId: agency.id,
      targetType: 'tenant_deletion',
      targetId: created.id,
    });
    return created;
  });
  return viewOf(row);
}

/** Step 2: a different owner or admin approves, typing the URL name again; the job is queued. */
export async function approveTenantDeletion(
  actor: PlatformAdminActor,
  agencyRef: string,
  deletionId: string,
  input: TenantDeletionConfirmInput,
  now: Date = new Date(),
): Promise<TenantDeletionView> {
  assertCanDelete(actor);
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  const row = await withUser(actor.userId, async (tx) => {
    const found = await tx.tenantDeletion.findFirst({
      where: { id: deletionId, tenantId: agency.id },
    });
    if (!found) throw notFound('Deletion');
    if (found.status !== 'requested') {
      throw new ApiError('conflict', `This deletion is ${found.status}`, { status: 409 });
    }
    if (found.requestedById === actor.userId) {
      throw forbidden('A different owner or admin has to approve this deletion');
    }
    assertTypedSlug(found.tenantSlug, input);
    const claimed = await tx.tenantDeletion.updateMany({
      where: { id: found.id, status: 'requested' },
      data: { status: 'approved', approvedById: actor.userId, approvedAt: now },
    });
    if (claimed.count !== 1) {
      throw new ApiError('conflict', 'This deletion was just changed by someone else', {
        status: 409,
      });
    }
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'tenant.deletion.approve',
      agencyId: agency.id,
      targetType: 'tenant_deletion',
      targetId: found.id,
    });
    return tx.tenantDeletion.findUniqueOrThrow({ where: { id: found.id } });
  });
  try {
    // A system job: its JobRun has no agency, so it survives the agency it deletes.
    const { jobRunId } = await enqueue({
      queue: 'maintenance',
      name: 'tenant.delete',
      agencyId: null,
      requestedById: actor.userId,
      data: { deletionId: row.id },
      idempotencyKey: `tenant.delete:${row.id}`,
      attempts: TENANT_DELETION_ATTEMPTS,
      backoffMs: 30_000,
    });
    return viewOf(
      await withUser(actor.userId, (tx) =>
        tx.tenantDeletion.update({ where: { id: row.id }, data: { jobRunId } }),
      ),
    );
  } catch (error) {
    await withUser(actor.userId, (tx) =>
      tx.tenantDeletion.updateMany({
        where: { id: row.id, status: 'approved' },
        data: { status: 'requested', approvedById: null, approvedAt: null },
      }),
    );
    throw error;
  }
}

/** Either owner or admin can stop a deletion that has not started running. */
export async function cancelTenantDeletion(
  actor: PlatformAdminActor,
  agencyRef: string,
  deletionId: string,
  now: Date = new Date(),
): Promise<TenantDeletionView> {
  assertCanDelete(actor);
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  const row = await withUser(actor.userId, async (tx) => {
    const found = await tx.tenantDeletion.findFirst({
      where: { id: deletionId, tenantId: agency.id },
    });
    if (!found) throw notFound('Deletion');
    const done = await tx.tenantDeletion.updateMany({
      where: { id: found.id, status: { in: ['requested', 'approved'] } },
      data: { status: 'cancelled', cancelledAt: now },
    });
    if (done.count !== 1) {
      throw new ApiError('conflict', `This deletion is ${found.status} and cannot be cancelled`, {
        status: 409,
      });
    }
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'tenant.deletion.cancel',
      agencyId: agency.id,
      targetType: 'tenant_deletion',
      targetId: found.id,
    });
    return tx.tenantDeletion.findUniqueOrThrow({ where: { id: found.id } });
  });
  return viewOf(row);
}

/** The newest deletion record of one agency (by id or URL name), or null. Works after the agency is gone if given its id. */
export async function getLatestTenantDeletion(
  actor: PlatformAdminActor,
  agencyRef: string,
): Promise<TenantDeletionView | null> {
  const agency = await getAgencyByRef(agencyRef);
  const tenantId = agency?.id ?? agencyRef;
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return null;
  const row = await withUser(actor.userId, (tx) =>
    tx.tenantDeletion.findFirst({ where: { tenantId }, orderBy: { requestedAt: 'desc' } }),
  );
  return row ? viewOf(row) : null;
}

/** All deletion records, newest first: the platform's permanent record of what was removed and who agreed. */
export async function listTenantDeletions(
  actor: PlatformAdminActor,
): Promise<TenantDeletionView[]> {
  const rows = await withUser(actor.userId, (tx) =>
    tx.tenantDeletion.findMany({ orderBy: { requestedAt: 'desc' }, take: 100 }),
  );
  return Promise.all(rows.map(viewOf));
}

function configuredStore(): ObjectStore | null {
  try {
    return getObjectStore();
  } catch {
    return null; // S3 not configured: nothing was ever stored there
  }
}

/**
 * Worker job `maintenance:tenant.delete`, run as the data-rights role (it deletes audit rows too).
 * Idempotent and resumable: progress is saved after every table, and a table that is already empty is
 * a no-op. The agency is closed first, so nothing new is written while it runs.
 */
export async function runTenantDeletionJob(
  ctx: JobContext,
  overrides: { scope?: Scope; store?: ObjectStore | null; now?: Date } = {},
): Promise<void> {
  const { deletionId } = ctx.data as { deletionId: string };
  const approverId = ctx.requestedById;
  if (!approverId) throw new UnrecoverableError('A tenant deletion needs the approver');
  const scope = overrides.scope ?? dataRightsScope;
  const store = overrides.store === undefined ? configuredStore() : overrides.store;
  const now = overrides.now ?? new Date();

  const row = await scope.withUser(approverId, (tx) =>
    tx.tenantDeletion.findUnique({ where: { id: deletionId } }),
  );
  if (!row || row.status === 'completed' || row.status === 'cancelled') return;
  if (row.status === 'requested') throw new UnrecoverableError('This deletion was not approved');
  const claimed = await scope.withUser(approverId, (tx) =>
    tx.tenantDeletion.updateMany({
      where: { id: row.id, status: { in: ['approved', 'running', 'failed'] } },
      data: { status: 'running', startedAt: row.startedAt ?? now, error: null },
    }),
  );
  if (claimed.count !== 1) return; // cancelled in the meantime

  const tenantId = row.tenantId;
  const progress: DeletionProgress = { ...((row.counts ?? {}) as DeletionProgress) };
  const save = () =>
    scope.withUser(approverId, (tx) =>
      tx.tenantDeletion.update({
        where: { id: row.id },
        data: { counts: progress as unknown as Prisma.InputJsonValue },
      }),
    );

  try {
    const agency = await scope.withUser(approverId, (tx) =>
      tx.agency.findUnique({ where: { id: tenantId }, select: { id: true } }),
    );
    if (agency) {
      await scope.withUser(approverId, (tx) =>
        tx.agency.update({ where: { id: tenantId }, data: { status: 'closed' } }),
      );
      // Remember who belonged to the agency before the memberships go; they are checked at the end.
      if (!progress.memberUserIds) {
        progress.memberUserIds = (
          await scope.withAgency(tenantId, (tx) =>
            tx.membership.findMany({ select: { userId: true } }),
          )
        ).map((m) => m.userId);
        await save();
      }
      // Objects first: if a later step fails, the retry still deletes the rows that pointed at them.
      if (progress.objectsNotRemoved === undefined) {
        const keys = (
          await scope.withAgency(tenantId, (tx) =>
            tx.fileObject.findMany({ where: { store: 's3' }, select: { externalRef: true } }),
          )
        ).flatMap((f) => (f.externalRef ? [f.externalRef] : []));
        progress.objectsNotRemoved = (await deleteObjects(store, keys)).length;
        await save();
      }
      progress.tables ??= {};
      for (const table of TENANT_TABLES) {
        if (progress.tables[table] !== undefined) continue;
        // `quoteTable` only accepts names from the fixed list; the id is a bound parameter.
        const removed = await scope.withAgency(tenantId, (tx) =>
          tx.$executeRawUnsafe(
            `DELETE FROM ${quoteTable(table)} WHERE "agencyId" = $1::uuid`,
            tenantId,
          ),
        );
        progress.tables[table] = removed;
        await save();
        await ctx.progress({ table, removed });
      }
    }

    // People who belonged to no other agency, are not platform administrators and appear in no audit
    // record. Each is looked at in their own scope, where they can see their own memberships (RLS).
    let usersRemoved = progress.usersRemoved ?? 0;
    for (const userId of progress.memberUserIds ?? []) {
      const stillMember = await scope.withUser(userId, (tx) =>
        tx.membership.count({ where: { userId } }),
      );
      if (stillMember > 0) continue;
      const removed = await scope.withUser(approverId, async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { platformRole: true },
        });
        if (!user || user.platformRole) return 0;
        const audited = await tx.platformAuditLog.count({ where: { adminId: userId } });
        const invited = await tx.platformAdminInvite.count({ where: { invitedById: userId } });
        if (audited + invited > 0) return 0;
        return (await tx.user.deleteMany({ where: { id: userId } })).count;
      });
      usersRemoved += removed;
    }
    progress.usersRemoved = usersRemoved;

    await scope.withUser(approverId, async (tx) => {
      await tx.agency.deleteMany({ where: { id: tenantId } });
      await tx.tenantDeletion.update({
        where: { id: row.id },
        data: {
          status: 'completed',
          completedAt: now,
          counts: progress as unknown as Prisma.InputJsonValue,
        },
      });
      await recordPlatformAudit(tx, {
        adminId: approverId,
        action: 'tenant.deletion.complete',
        agencyId: tenantId,
        targetType: 'tenant_deletion',
        targetId: row.id,
        data: {
          rowsRemoved: Object.values(progress.tables ?? {}).reduce((sum, n) => sum + n, 0),
          usersRemoved,
          objectsNotRemoved: progress.objectsNotRemoved ?? 0,
        },
      });
    });
    await ctx.progress({ completed: true });
  } catch (error) {
    // Only the last attempt marks it failed; an earlier one stays "running" and the queue retries.
    if (ctx.attempt >= TENANT_DELETION_ATTEMPTS) {
      await scope.withUser(approverId, (tx) =>
        tx.tenantDeletion.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            error: error instanceof Error ? error.message.slice(0, 300) : 'deletion_failed',
          },
        }),
      );
    }
    throw error;
  }
}
