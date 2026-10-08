// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, renderWithIntl } from '@/test/render';
import { AppShell } from './app-shell';
import { SupportBanner } from './support-banner';

vi.mock('next/navigation', () => ({
  usePathname: () => '/a/acme/positions',
  useRouter: () => ({ push: vi.fn() }),
}));

const support = {
  agencyName: 'Acme Recruiting',
  expiresAt: '2026-10-08T13:00:00.000Z',
  exitHref: '/admin/agencies/a1',
};

describe('SupportBanner (FR-ADM-07)', () => {
  it('says whose workspace, that it is read-only, until when, and how to leave', async () => {
    const { container } = renderWithIntl(<SupportBanner {...support} />);
    const banner = screen.getByRole('region', { name: 'Support access' });
    expect(banner.textContent).toContain(
      'You are viewing Acme Recruiting as Team of Wakers support. Read-only.',
    );
    expect(banner.textContent).toContain('Oct 8, 2026');
    expect(banner.textContent).toContain("recorded in the agency's activity log");
    expect(screen.getByRole('link', { name: 'Leave this workspace' }).getAttribute('href')).toBe(
      '/admin/agencies/a1',
    );
    await expectNoA11yViolations(container);
  });

  it('appears in the workbench frame only for a support session', () => {
    const shell = (withSupport: boolean) => (
      <AppShell
        agencySlug="acme"
        agencies={[{ slug: 'acme', name: 'Acme Recruiting' }]}
        userName="Sam"
        support={withSupport ? support : undefined}
      >
        <p>Content</p>
      </AppShell>
    );
    const { unmount } = renderApp(shell(false));
    expect(screen.queryByRole('region', { name: 'Support access' })).toBeNull();
    unmount();
    renderApp(shell(true));
    expect(screen.getByRole('region', { name: 'Support access' })).toBeTruthy();
  });
});
