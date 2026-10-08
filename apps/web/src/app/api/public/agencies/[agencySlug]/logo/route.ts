// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: public
import { parseBranding } from '@easemuse/core';
import { getAgencyPortalInfo, withAgency } from '@/lib/db';
import { rateLimit } from '@/lib/http/rate-limit';
import { loadLogo } from '@/server/branding/service';

/**
 * The agency logo for portal pages and emails (FR-TEN-04). It is the same image the agency shows on
 * its public portal page, so it needs no sign-in; an agency with no logo, or one that is closed, is a 404.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string }> },
): Promise<Response> {
  const limited = await rateLimit(req, { name: 'agency-logo', limit: 120, windowSec: 60 });
  if (limited) return limited;
  const { agencySlug } = await ctx.params;
  const agency = await getAgencyPortalInfo(agencySlug);
  if (!agency || agency.status === 'closed') return new Response(null, { status: 404 });
  const logo = await withAgency(agency.id, (tx) =>
    loadLogo(tx, agency.id, parseBranding(agency.branding)),
  );
  if (!logo) return new Response(null, { status: 404 });
  const etag = `"${logo.sha256}"`;
  const headers = {
    'content-type': logo.contentType,
    'x-content-type-options': 'nosniff',
    'cache-control': 'public, max-age=3600',
    etag,
  };
  if (req.headers.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(logo.bytes), { headers });
}
