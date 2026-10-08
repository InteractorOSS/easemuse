// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { connectMailboxInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { getEnv } from '@/lib/env';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { mailboxDepsFromEnv, startMailboxConnection } from '@/server/messaging/mailbox';

/** Starts connecting a mailbox: returns the address to send the person to, to sign in. Any member. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { provider } = await parseBody(req, connectMailboxInputSchema);
    return ok(
      await startMailboxConnection(mailboxDepsFromEnv(), {
        agencyId: authed.agency.id,
        userId: authed.userId,
        provider,
        returnUrl: `${getEnv().APP_URL.replace(/\/$/, '')}/a/${authed.agency.slug}/settings/mailbox`,
      }),
    );
  });
}
