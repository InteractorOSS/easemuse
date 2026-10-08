// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  PORTAL_INVITE_TTL_DAYS,
  PORTAL_RELOGIN_TTL_MINUTES,
  type PortalAudienceValue,
} from '@easemuse/core';
import { resolveLocale } from '@/i18n/config';
import type { ScopedTx } from '@/lib/db';
import { renderPortalLinkEmail } from '@/server/messaging/templates';
import { queuePortalEmail, type PortalLink } from './identity';

/** Where a portal audience lands: hiring managers under /h, candidates under /c (ADR-003). */
export const PORTAL_PREFIX: Record<PortalAudienceValue, string> = {
  hiring_manager: 'h',
  candidate: 'c',
};

export function portalEnterUrl(
  baseUrl: string,
  agencySlug: string,
  audience: PortalAudienceValue,
  token: string,
): string {
  return `${baseUrl.replace(/\/$/, '')}/${PORTAL_PREFIX[audience]}/${agencySlug}/enter#token=${encodeURIComponent(token)}`;
}

/**
 * Puts the link in an email in the outbox. The token travels in the URL fragment, so it is not sent
 * to servers, logs or referrers when the page loads; the page reads it and posts it (ADR-002).
 */
export async function emailPortalLink(
  tx: ScopedTx,
  input: {
    agency: { id: string; slug: string; name: string };
    senderId: string | null;
    link: PortalLink;
    kind: 'invite' | 'relogin';
    baseUrl: string;
    agencyLocale: string | null;
  },
): Promise<{ outboxMessageId: string }> {
  const rendered = await renderPortalLinkEmail({
    locale: resolveLocale({ agencyLocale: input.agencyLocale }),
    agencyName: input.agency.name,
    url: portalEnterUrl(input.baseUrl, input.agency.slug, input.link.audience, input.link.token),
    kind: input.kind,
    days: PORTAL_INVITE_TTL_DAYS,
    minutes: PORTAL_RELOGIN_TTL_MINUTES,
  });
  const message = await queuePortalEmail(tx, {
    agencyId: input.agency.id,
    senderId: input.senderId,
    email: input.link.email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
  return { outboxMessageId: message.id };
}
