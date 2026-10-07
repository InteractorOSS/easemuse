// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { sendInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getEnv } from '@/lib/env';
import { dispatchOutboxMessage } from '@/server/messaging/outbox';
import { unsubscribeUrl } from '@/server/messaging/unsubscribe';
import { sendTouchEmail } from '@/server/outreach/service';

const touchParam = z.coerce.number().int().min(1).max(3);

/** Sends the approved email for this touch (409 `not_approved`, `suppressed`, `do_not_contact`). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string; n: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId, n } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { versionId } = await parseBody(req, sendInputSchema);
    const touchNumber = touchParam.parse(n);
    const sent = await withAgency(
      authed.agency.id,
      (tx) =>
        sendTouchEmail(tx, authed.actor, entryId, touchNumber, versionId, new Date(), {
          unsubscribeFor: (address) => {
            const { AUTH_SECRET: secret, APP_URL: baseUrl } = getEnv();
            if (!secret) throw new Error('AUTH_SECRET is required to sign unsubscribe links');
            return unsubscribeUrl({ baseUrl, secret, agencyId: authed.agency.id, address });
          },
        }),
      { userId: authed.userId },
    );
    await dispatchOutboxMessage({
      agencyId: authed.agency.id,
      outboxMessageId: sent.outboxMessageId,
      requestedById: authed.userId,
    });
    return ok(sent);
  });
}
