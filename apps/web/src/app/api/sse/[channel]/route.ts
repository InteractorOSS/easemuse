// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: user
import { authorizeUser } from '@/lib/auth/authorize';
import { membershipLoader } from '@/lib/auth/membership';
import { getJobRun, withAgency } from '@/lib/db';
import { handleRoute } from '@/lib/http/responses';
import { authorizeChannel, type ChannelAuthDeps } from '@/lib/realtime/authorize-channel';
import { getChannelHub } from '@/lib/realtime/channel-hub';
import { createSseResponse } from '@/lib/realtime/sse-stream';

export const dynamic = 'force-dynamic';

const loadMembership = membershipLoader({ withAgency });
const deps: ChannelAuthDeps = {
  async isActiveMember(agencyId, userId) {
    return (await loadMembership(agencyId, userId))?.active === true;
  },
  getJobRun,
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ channel: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizeUser();
    if (authed instanceof Response) return authed;

    const { channel } = await ctx.params;
    const name = safeDecode(channel);
    await authorizeChannel(name, authed.userId, deps);

    return createSseResponse({
      signal: req.signal,
      subscribe: (listener) => getChannelHub().subscribe(name, listener),
      // Re-check periodically: removing a member must also end their open streams.
      stillAllowed: async () => {
        try {
          await authorizeChannel(name, authed.userId, deps);
          return true;
        } catch {
          return false;
        }
      },
    });
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
