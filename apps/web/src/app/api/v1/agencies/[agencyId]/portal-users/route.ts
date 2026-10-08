// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { invitePortalUserInputSchema, portalDirectoryQuerySchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { getAgencyDefaultLocale, withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody, parseQuery } from '@/lib/http/validation';
import { listDirectory } from '@/server/portal/directory';
import { dispatchOutboxMessage } from '@/server/messaging/outbox';
import { invitePortalUser } from '@/server/portal/identity';
import { emailPortalLink } from '@/server/portal/links';

/**
 * Invites a hiring manager (client contact) or a candidate to the portal and emails the one-time
 * link. Leads and admins invite hiring managers; 409 when there is no email on file.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, invitePortalUserInputSchema);
    const locale = await getAgencyDefaultLocale(authed.agency.id);
    const sent = await withAgency(
      authed.agency.id,
      async (tx) => {
        const link = await invitePortalUser(tx, authed.actor, input);
        const mail = await emailPortalLink(tx, {
          agency: authed.agency,
          senderId: authed.userId,
          link,
          kind: 'invite',
          baseUrl: getEnv().APP_URL,
          agencyLocale: locale,
        });
        return { portalUserId: link.portalUserId, expiresAt: link.expiresAt, ...mail };
      },
      { userId: authed.userId },
    );
    await dispatchOutboxMessage({
      agencyId: authed.agency.id,
      outboxMessageId: sent.outboxMessageId,
      requestedById: authed.userId,
    });
    return created({ portalUserId: sent.portalUserId, expiresAt: sent.expiresAt });
  });
}

/** The client's contacts (`?clientId=`) or one candidate (`?candidateId=`) with whether they already have portal access. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const query = parseQuery(req, portalDirectoryQuerySchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => listDirectory(tx, query), {
        userId: authed.userId,
      }),
    );
  });
}
