// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { JobRunRecord } from '../db/job-runs';
import { notFound } from '../http/errors';
import { parseChannel, type ParsedChannel } from './channels';

export interface ChannelAuthDeps {
  /** True when the user holds an ACTIVE membership in the agency (read through RLS). */
  isActiveMember(agencyId: string, userId: string): Promise<boolean>;
  getJobRun(id: string): Promise<JobRunRecord | null>;
}

/**
 * Decides whether `userId` may subscribe to `channelName`. Every denial is the same 404, so a
 * caller cannot tell a forbidden channel from one that does not exist (ADR-012). Channel names
 * carry the agency id, so the check needs nothing from the client.
 */
export async function authorizeChannel(
  channelName: string,
  userId: string,
  deps: ChannelAuthDeps,
): Promise<ParsedChannel> {
  const channel = parseChannel(channelName);
  if (!channel) throw notFound('Channel');

  switch (channel.kind) {
    case 'agency':
    case 'position':
      if (!(await deps.isActiveMember(channel.agencyId, userId))) throw notFound('Channel');
      return channel;
    case 'user':
      if (channel.userId !== userId) throw notFound('Channel');
      return channel;
    case 'job': {
      const job = await deps.getJobRun(channel.jobRunId);
      if (!job) throw notFound('Channel');
      const allowed = job.agencyId
        ? await deps.isActiveMember(job.agencyId, userId)
        : job.requestedById === userId;
      if (!allowed) throw notFound('Channel');
      return channel;
    }
  }
}
