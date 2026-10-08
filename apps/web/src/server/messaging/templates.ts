// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createTranslator } from 'next-intl';
import type { AgencyRole } from '@easemuse/core';
import type { Locale } from '@/i18n/config';
import { loadMessages } from '@/i18n/messages';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Loosely typed translator: the catalogs are loaded at runtime, so keys are not known to the compiler. */
type Translate = (key: string, values?: Record<string, string | number>) => string;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Email copy comes from the same localized catalogs as the UI (ADR-015). */
export async function renderMemberInviteEmail(input: {
  locale: Locale;
  agencyName: string;
  inviterName: string;
  role: AgencyRole;
  acceptUrl: string;
  days: number;
}): Promise<RenderedEmail> {
  const messages = await loadMessages(input.locale);
  const translator = (namespace: string): Translate =>
    createTranslator({
      locale: input.locale,
      messages,
      namespace,
    } as never) as unknown as Translate;
  const email = translator('email');
  const members = translator('members');
  const values = {
    inviter: input.inviterName,
    agency: input.agencyName,
    role: members(`roles.${input.role}`),
    days: input.days,
  };

  const subject = email('invite.subject', values);
  const text = [
    email('invite.heading', values),
    '',
    email('invite.intro', values),
    '',
    `${email('invite.action')}: ${input.acceptUrl}`,
    '',
    email('invite.expiry', values),
    email('invite.ignore'),
    '',
    email('footer', values),
  ].join('\n');

  const html = `<!doctype html><html lang="${input.locale}"><body style="font-family:system-ui,sans-serif;color:#111827">
<h1 style="font-size:20px">${escapeHtml(email('invite.heading', values))}</h1>
<p>${escapeHtml(email('invite.intro', values))}</p>
<p><a href="${escapeHtml(input.acceptUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(email('invite.action'))}</a></p>
<p style="color:#4b5563;font-size:13px">${escapeHtml(email('invite.linkHint'))}<br>${escapeHtml(input.acceptUrl)}</p>
<p style="color:#4b5563;font-size:13px">${escapeHtml(email('invite.expiry', values))} ${escapeHtml(email('invite.ignore'))}</p>
<p style="color:#6b7280;font-size:12px">${escapeHtml(email('footer', values))}</p>
</body></html>`;

  return { subject, text, html };
}

/** The line every outreach email ends with (FR-MSG-05); copy comes from the same catalogs. */
export async function renderUnsubscribeFooter(input: {
  locale: Locale;
  url: string;
}): Promise<{ text: string; html: string }> {
  const messages = await loadMessages(input.locale);
  const email = createTranslator({
    locale: input.locale,
    messages,
    namespace: 'email',
  } as never) as unknown as Translate;
  const line = email('unsubscribe.line');
  return {
    text: `\n\n--\n${line}: ${input.url}`,
    html: `<hr><p style="color:#6b7280;font-size:12px">${escapeHtml(line)}: <a href="${escapeHtml(input.url)}">${escapeHtml(email('unsubscribe.action'))}</a></p>`,
  };
}

/** The email that carries a portal link (invite or re-login); copy from the localized catalogs (ADR-015). */
export async function renderPortalLinkEmail(input: {
  locale: Locale;
  agencyName: string;
  url: string;
  kind: 'invite' | 'relogin';
  days: number;
  minutes: number;
}): Promise<RenderedEmail> {
  const messages = await loadMessages(input.locale);
  const email = createTranslator({
    locale: input.locale,
    messages,
    namespace: 'email.portal',
  } as never) as unknown as Translate;
  const values = { agency: input.agencyName, days: input.days, minutes: input.minutes };
  const intro = email(input.kind === 'invite' ? 'introInvite' : 'introRelogin', values);
  const expiry = email(input.kind === 'invite' ? 'expiryInvite' : 'expiryRelogin', values);
  const subject = email('subject', values);
  const text = [
    email('heading', values),
    '',
    intro,
    '',
    `${email('action')}: ${input.url}`,
    '',
    expiry,
    email('ignore'),
  ].join('\n');
  const html = `<!doctype html><html lang="${input.locale}"><body style="font-family:system-ui,sans-serif;color:#111827">
<h1 style="font-size:20px">${escapeHtml(email('heading', values))}</h1>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(email('action'))}</a></p>
<p style="color:#4b5563;font-size:13px">${escapeHtml(email('linkHint'))}<br>${escapeHtml(input.url)}</p>
<p style="color:#4b5563;font-size:13px">${escapeHtml(expiry)} ${escapeHtml(email('ignore'))}</p>
</body></html>`;
  return { subject, text, html };
}

export type PortalNotice =
  | {
      type: 'shared';
      kind: 'jd_for_approval' | 'submission' | 'tailored_resume' | 'status';
      updated: boolean;
    }
  | { type: 'answered' };

/**
 * A short email telling a portal user that something is waiting (T-14-07). It carries no link that
 * signs in and none of the content: the person opens the portal, and signs in again by emailed link
 * if the session has ended. Copy comes from the localized catalogs (ADR-015).
 */
export async function renderPortalNoticeEmail(input: {
  locale: Locale;
  agencyName: string;
  url: string;
  notice: PortalNotice;
}): Promise<RenderedEmail> {
  const messages = await loadMessages(input.locale);
  const email = createTranslator({
    locale: input.locale,
    messages,
    namespace: 'email.portal.notice',
  } as never) as unknown as Translate;
  const values = { agency: input.agencyName };
  const line =
    input.notice.type === 'answered'
      ? email('answered', values)
      : email(`${input.notice.updated ? 'updated' : 'shared'}.${input.notice.kind}`, values);
  const subject = email('subject', values);
  const text = [
    email('heading', values),
    '',
    line,
    '',
    `${email('action')}: ${input.url}`,
    '',
    email('signIn'),
    email('noDetails'),
  ].join('\n');
  const html = `<!doctype html><html lang="${input.locale}"><body style="font-family:system-ui,sans-serif;color:#111827">
<h1 style="font-size:20px">${escapeHtml(email('heading', values))}</h1>
<p>${escapeHtml(line)}</p>
<p><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(email('action'))}</a></p>
<p style="color:#4b5563;font-size:13px">${escapeHtml(email('signIn'))} ${escapeHtml(email('noDetails'))}</p>
</body></html>`;
  return { subject, text, html };
}
