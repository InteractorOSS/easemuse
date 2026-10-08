// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { resolveLocale } from '@/i18n/config';
import { getAgencyDefaultLocale, type ScopedTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { createOutboxMessage } from '@/server/messaging/outbox';
import { renderPortalNoticeEmail, type PortalNotice } from '@/server/messaging/templates';
import { PORTAL_PREFIX } from './links';

/**
 * Tells a portal user by email that something is waiting (T-14-07, US-1404): an item was shared or
 * updated, or the recruiter answered their recommendation. The message is queued INSIDE the caller's
 * transaction, so no email is promised for a change that rolled back; the caller dispatches it after
 * the commit. Returns null when the person is turned off. No email carries the content or a sign-in link.
 */
export async function queuePortalNotice(
  tx: ScopedTx,
  input: { agencyId: string; senderId: string | null; portalUserId: string; notice: PortalNotice },
): Promise<{ outboxMessageId: string } | null> {
  const user = await tx.portalUser.findUnique({
    where: { id: input.portalUserId },
    select: { email: true, audience: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return null;
  const agency = await tx.agency.findUnique({
    where: { id: input.agencyId },
    select: { slug: true, name: true },
  });
  if (!agency) return null;
  const locale = resolveLocale({ agencyLocale: await getAgencyDefaultLocale(input.agencyId) });
  const base = getEnv().APP_URL.replace(/\/$/, '');
  const rendered = await renderPortalNoticeEmail({
    locale,
    agencyName: agency.name,
    url: `${base}/${PORTAL_PREFIX[user.audience]}/${agency.slug}`,
    notice: input.notice,
  });
  const message = await createOutboxMessage(tx, {
    agencyId: input.agencyId,
    senderId: input.senderId,
    toAddress: user.email,
    subject: rendered.subject,
    bodyText: rendered.text,
    bodyHtml: rendered.html,
    kind: 'notification',
  });
  return { outboxMessageId: message.id };
}
