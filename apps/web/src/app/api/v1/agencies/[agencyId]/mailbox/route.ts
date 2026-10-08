// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { recordMailboxInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, noContent, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import {
  disconnectMailbox,
  getMyMailbox,
  mailboxDepsFromEnv,
  recordMailbox,
} from '@/server/messaging/mailbox';

type Ctx = { params: Promise<{ agencyId: string }> };

/** The signed-in person's connected mailbox, or null. Any member. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getMyMailbox(tx, authed.userId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Records the mailbox after the person signed in at Google or Microsoft (409 when it is not theirs or not active). */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, recordMailboxInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) =>
          recordMailbox(tx, mailboxDepsFromEnv(), {
            agencyId: authed.agency.id,
            userId: authed.userId,
            ...input,
          }),
        { userId: authed.userId },
      ),
    );
  });
}

/** Disconnects: the credential is deleted at Interactor and the record removed. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(
      authed.agency.id,
      (tx) =>
        disconnectMailbox(tx, mailboxDepsFromEnv(), {
          agencyId: authed.agency.id,
          userId: authed.userId,
        }),
      { userId: authed.userId },
    );
    return noContent();
  });
}
