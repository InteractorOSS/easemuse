// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UnrecoverableError } from 'bullmq';
import type { AgencyActor } from '@easemuse/core';
import type { JobContext } from './registry';

/**
 * The person a job runs for, with their current role. AI jobs never start on their own (brief 1.1):
 * a job without a requester, or whose requester has left the agency, is stopped for good.
 */
export async function actorForJob(ctx: JobContext): Promise<AgencyActor> {
  if (!ctx.agencyId || !ctx.requestedById)
    throw new UnrecoverableError('A recruiter must ask for this');
  const agencyId = ctx.agencyId;
  const userId = ctx.requestedById;
  const member = await ctx.withAgency((tx) =>
    tx.membership.findFirst({ where: { userId, active: true }, select: { role: true } }),
  );
  if (!member) throw new UnrecoverableError('The person who asked is no longer a member');
  return { kind: 'agency', userId, agencyId, role: member.role };
}
