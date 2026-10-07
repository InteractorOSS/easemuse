// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { AgencySwitcher } from './agency-switcher';
import { AppShell } from './app-shell';
import { Nav } from './nav';

const push = vi.fn();
let pathname = '/a/acme/positions';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
  pathname = '/a/acme/positions';
});

describe('Nav', () => {
  it('links to each area of the agency and marks the current page', () => {
    renderWithIntl(<Nav agencySlug="acme" />);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/a/acme/tasks',
      '/a/acme/positions',
      '/a/acme/candidates',
      '/a/acme/clients',
      '/a/acme/settings',
    ]);
    expect(within(nav).getByRole('link', { name: 'Positions' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(nav).getByRole('link', { name: 'Clients' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('keeps a parent item current on nested pages', () => {
    pathname = '/a/acme/candidates/123';
    renderWithIntl(<Nav agencySlug="acme" />);
    expect(screen.getByRole('link', { name: 'Candidates' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

describe('AgencySwitcher', () => {
  const agencies = [
    { slug: 'acme', name: 'Acme Recruiting' },
    { slug: 'globex', name: 'Globex Talent' },
  ];

  it('lists agencies with the current one selected and navigates on change', () => {
    renderWithIntl(<AgencySwitcher agencies={agencies} currentSlug="acme" />);
    const select = screen.getByLabelText('Switch agency') as HTMLSelectElement;
    expect(select.value).toBe('acme');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Acme Recruiting', 'Globex Talent']);
    fireEvent.change(select, { target: { value: 'globex' } });
    expect(push).toHaveBeenCalledWith('/a/globex');
  });
});

describe('AppShell', () => {
  it('renders the frame: skip link, brand, user, sign-out, nav and main content', () => {
    renderWithIntl(
      <AppShell agencySlug="acme" agencies={[{ slug: 'acme', name: 'Acme' }]} userName="Ann">
        <p>page content</p>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
      '#main',
    );
    expect(screen.getByText('EaseMuse')).toBeTruthy();
    expect(screen.getByText('Signed in as Ann')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign out' }).getAttribute('href')).toBe(
      '/api/auth/signout',
    );
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(within(screen.getByRole('main')).getByText('page content')).toBeTruthy();
  });
});
