// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: public
import { reloginInputSchema } from '@easemuse/core';
import { getAgencyDefaultLocale, getAgencyByRef, withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { rateLimit } from '@/lib/http/rate-limit';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { dispatchOutboxMessage } from '@/server/messaging/outbox';
import { requestRelogin } from '@/server/portal/identity';
import { emailPortalLink } from '@/server/portal/links';

/**
 * Sends a fresh 15-minute link to an invited person. The answer is always the same, so nobody can
 * find out who has been invited. Limited per address and per network address.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string }> },
): Promise<Response> {
  const limited = await rateLimit(req, { name: 'portal-relogin:ip', limit: 10, windowSec: 600 });
  if (limited) return limited;
  return handleRoute(async () => {
    const { agencySlug } = await ctx.params;
    const input = await parseBody(req, reloginInputSchema);
    const byEmail = await rateLimit(
      req,
      { name: 'portal-relogin:email', limit: 3, windowSec: 600 },
      input.email.toLowerCase(),
    );
    if (byEmail) return byEmail;
    const agency = await getAgencyByRef(agencySlug);
    const link = agency
      ? await requestRelogin({ agencySlug, email: input.email, audience: input.audience })
      : null;
    if (agency && link) {
      const locale = await getAgencyDefaultLocale(agency.id);
      const mail = await withAgency(agency.id, (tx) =>
        emailPortalLink(tx, {
          agency,
          senderId: null,
          link,
          kind: 'relogin',
          baseUrl: getEnv().APP_URL,
          agencyLocale: locale,
        }),
      );
      await dispatchOutboxMessage({
        agencyId: agency.id,
        outboxMessageId: mail.outboxMessageId,
        requestedById: null,
      });
    }
    return ok({ sent: true });
  });
}
