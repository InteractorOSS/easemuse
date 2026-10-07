// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: public
import { withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { rateLimit } from '@/lib/http/rate-limit';
import { applyUnsubscribe, verifyUnsubscribeToken } from '@/server/messaging/unsubscribe';

type Ctx = { params: Promise<{ token: string }> };

const page = (title: string, text: string, status: number) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><main><h1 style="font-size:1.5rem">${title}</h1><p>${text}</p></main></body></html>`,
    {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    },
  );

async function unsubscribe(req: Request, ctx: Ctx, html: boolean): Promise<Response> {
  const limited = await rateLimit(req, { name: 'unsubscribe', limit: 20, windowSec: 60 });
  if (limited) return limited;
  const { token } = await ctx.params;
  const secret = getEnv().AUTH_SECRET;
  const parsed = secret ? verifyUnsubscribeToken(secret, token) : null;
  if (!parsed) {
    return html
      ? page(
          'This link is not valid',
          'The link may be incomplete. Reply to the email and ask to be removed.',
          400,
        )
      : new Response(null, { status: 400 });
  }
  await withAgency(parsed.agencyId, (tx) => applyUnsubscribe(tx, parsed.agencyId, parsed.address));
  return html
    ? page('You are unsubscribed', 'You will not receive further emails from this recruiter.', 200)
    : new Response(null, { status: 204 });
}

/** The link in the email footer: opens a confirmation page and records the opt-out. */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return unsubscribe(req, ctx, true);
}

/** One-click unsubscribe (RFC 8058) from mail programs. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return unsubscribe(req, ctx, false);
}
