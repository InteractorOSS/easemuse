// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { renderMemberInviteEmail } from './templates';

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
