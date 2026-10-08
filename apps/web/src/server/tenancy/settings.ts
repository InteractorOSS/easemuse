// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  agencySettingsSchema,
  parseAgencySettings,
  type AgencyActor,
  type AgencySettings,
  type AgencySettingsPatch,
} from '@easemuse/core';
import { withAgency, type ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { zodFields } from '@/lib/http/responses';
import { smtpConfigFromEnv } from '@/server/messaging/smtp';

/** The agency's settings with every default filled in (FR-TEN-03). Read this, never the raw JSON. */
export async function getAgencySettings(tx: ScopedTx, agencyId: string): Promise<AgencySettings> {
  const row = await tx.agency.findUnique({ where: { id: agencyId }, select: { settings: true } });
  if (!row) throw notFound('Agency');
  return parseAgencySettings(row.settings);
}

export async function readSettings(actor: AgencyActor): Promise<AgencySettings> {
  return withAgency(actor.agencyId, (tx) => getAgencySettings(tx, actor.agencyId), {
    userId: actor.userId,
  });
}

/**
 * Applies a patch to the agency's settings. The merged result is validated as a whole (so matching
 * weights always add up to 100) and the change is logged with the names of the keys, never values
 * that could hold content. Settings apply to this agency only: the row is read and written through RLS.
 */
export async function updateSettings(
  actor: AgencyActor,
  patch: AgencySettingsPatch,
): Promise<AgencySettings> {
  return withAgency(
    actor.agencyId,
    async (tx) => {
      const current = await getAgencySettings(tx, actor.agencyId);
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const merged = agencySettingsSchema.safeParse({ ...current, ...defined });
      if (!merged.success) {
        throw new ApiError('invalid_input', 'Invalid settings', {
          status: 422,
          fields: zodFields(merged.error),
        });
      }
      // A real transport the server cannot run would turn every send into a failure; say so now.
      if (merged.data.emailTransport === 'smtp' && !smtpConfigFromEnv()) {
        throw new ApiError('invalid_input', 'SMTP is not set up on this server', {
          status: 422,
          fields: { emailTransport: 'SMTP is not set up on this server' },
        });
      }
      await tx.agency.update({
        where: { id: actor.agencyId },
        data: { settings: merged.data as unknown as Prisma.InputJsonValue },
      });
      await tx.activityLog.create({
        data: {
          agencyId: actor.agencyId,
          actorType: 'user',
          actorId: actor.userId,
          action: 'settings.updated',
          entityType: 'agency',
          entityId: actor.agencyId,
          data: { keys: Object.keys(defined) },
        },
      });
      return merged.data;
    },
    { userId: actor.userId },
  );
}
