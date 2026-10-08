// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { brandHeaderHtml, renderMemberInviteEmail, renderPortalLinkEmail } from './templates';

const base = {
  locale: 'en' as const,
  agencyName: 'Acme Talent',
  inviterName: 'Ann',
  role: 'lead' as const,
  acceptUrl: 'https://app.test/invite/acme?token=abc',
  days: 7,
};

describe('renderMemberInviteEmail', () => {
  it('fills the subject, text and html from the catalog', async () => {
    const mail = await renderMemberInviteEmail(base);
    expect(mail.subject).toBe('Ann invited you to join Acme Talent on EaseMuse');
    expect(mail.text).toContain('as Lead');
    expect(mail.text).toContain('https://app.test/invite/acme?token=abc');
    expect(mail.text).toContain('expires in 7 days');
    expect(mail.html).toContain('href="https://app.test/invite/acme?token=abc"');
  });

  it('escapes user-controlled values in the HTML', async () => {
    const mail = await renderMemberInviteEmail({
      ...base,
      agencyName: 'A <b>&"Co"',
      inviterName: '<script>x</script>',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('falls back to English for an untranslated locale', async () => {
    const mail = await renderMemberInviteEmail({ ...base, locale: 'ko' });
    expect(mail.subject).toContain('invited you to join');
  });
});

describe('agency branding in emails (T-14-06, FR-TEN-04)', () => {
  const brand = {
    name: 'Acme <Search>',
    color: '#1d4ed8',
    logoUrl: 'https://app.test/api/public/agencies/acme/logo?v=f1',
  };

  it('puts the logo, the name and the colour at the top, escaped', () => {
    const html = brandHeaderHtml(brand);
    expect(html).toContain('src="https://app.test/api/public/agencies/acme/logo?v=f1"');
    expect(html).toContain('Acme &lt;Search&gt;');
    expect(html).toContain('border-bottom:4px solid #1d4ed8');
    expect(html).not.toContain('<Search>');
  });

  it('leaves out the image when the agency has no logo, and everything when there is no brand', () => {
    expect(brandHeaderHtml({ ...brand, logoUrl: null })).not.toContain('<img');
    expect(brandHeaderHtml(undefined)).toBe('');
  });

  it('brands the portal link and the member invite, and colours their buttons', async () => {
    const link = await renderPortalLinkEmail({
      locale: 'en',
      agencyName: 'Acme',
      url: 'https://app.test/h/acme/enter#token=t',
      kind: 'invite',
      days: 7,
      minutes: 15,
      brand,
    });
    expect(link.html).toContain('logo?v=f1');
    expect(link.html).toContain('background:#1d4ed8');
    const invite = await renderMemberInviteEmail({
      ...base,
      brand: { ...brand, color: '#7c2d12' },
    });
    expect(invite.html).toContain('background:#7c2d12');
    expect(invite.html).toContain('logo?v=f1');
    expect((await renderMemberInviteEmail(base)).html).not.toContain('<img');
  });
});
