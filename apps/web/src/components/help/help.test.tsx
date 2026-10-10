// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from '@/components/admin/admin-shell';
import { PortalShell } from '@/components/portal/portal-shell';
import { AppShell } from '@/components/shell/app-shell';
import { HELP_AUDIENCES, HELP_TOPICS, helpHref } from '@/lib/help/topics';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, renderWithIntl } from '@/test/render';
import { HelpArticle } from './help-article';
import { HelpIndex } from './help-index';
import { HelpLink, PageHelpLink } from './help-link';

let pathname = '/a/acme/positions';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe('HelpLink', () => {
  it('links to the topic of the audience', () => {
    renderWithIntl(<HelpLink audience="recruiter" agencySlug="acme" topic="matching" />);
    expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe(
      '/a/acme/help/matching',
    );
  });

  it('falls back to the help index for an unknown topic', () => {
    renderWithIntl(<HelpLink audience="candidate" agencySlug="acme" topic="nope" />);
    expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe('/c/acme/help');
  });

  it('PageHelpLink picks the topic that fits the page', () => {
    pathname = '/a/acme/positions/p1/benchmark';
    renderWithIntl(<PageHelpLink />);
    expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe(
      '/a/acme/help/benchmarking',
    );
  });

  it('PageHelpLink renders nothing outside the help areas', () => {
    pathname = '/pricing';
    const { container } = renderWithIntl(<PageHelpLink />);
    expect(container.textContent).toBe('');
  });
});

describe('page frames carry a help link', () => {
  it('workbench', () => {
    pathname = '/a/acme/analytics';
    renderApp(
      <AppShell agencySlug="acme" agencies={[]} userName="Riley">
        <p>x</p>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe(
      '/a/acme/help/analytics',
    );
  });

  it('admin', () => {
    pathname = '/admin/usage';
    renderWithIntl(
      <AdminShell userName="Olivia" role="owner">
        <p>x</p>
      </AdminShell>,
    );
    expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe(
      '/admin/help/monitoring',
    );
  });

  it.each([
    ['h', '/h/acme', '/h/acme/help/reviewing'],
    ['c', '/c/acme/consent', '/c/acme/help/consent'],
  ] as const)('portal %s, signed in and out', (prefix, path, href) => {
    pathname = path;
    for (const signedIn of [true, false]) {
      const view = renderWithIntl(
        <PortalShell
          agencyName="Acme"
          color="#123456"
          slug="acme"
          prefix={prefix}
          signedIn={signedIn}
        >
          <p>x</p>
        </PortalShell>,
      );
      expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe(href);
      view.unmount();
    }
  });
});

describe('help content', () => {
  for (const audience of HELP_AUDIENCES) {
    const slug = audience === 'admin' ? null : 'acme';

    it(`${audience}: the index lists every topic and passes axe`, async () => {
      const { container } = renderWithIntl(<HelpIndex audience={audience} agencySlug={slug} />);
      const list = within(container).getByRole('list');
      expect(
        within(list)
          .getAllByRole('link')
          .map((l) => l.getAttribute('href')),
      ).toEqual(HELP_TOPICS[audience].map((t) => helpHref(audience, slug, t)));
      await expectNoA11yViolations(container);
    });

    for (const topic of HELP_TOPICS[audience]) {
      it(`${audience}/${topic}: renders a titled article and passes axe`, async () => {
        const { container } = renderWithIntl(
          <HelpArticle audience={audience} agencySlug={slug} topic={topic} />,
        );
        expect(screen.getByRole('heading', { level: 1 }).textContent?.length).toBeGreaterThan(3);
        expect(screen.getByRole('link', { name: 'All help topics' })).toBeTruthy();
        await expectNoA11yViolations(container);
      });
    }
  }

  it('names the brief section a recruiter topic is based on, and links to the next topic', () => {
    renderWithIntl(<HelpArticle audience="recruiter" agencySlug="acme" topic="matching" />);
    expect(screen.getByText('Based on section §5 of the product brief.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Next: / }).getAttribute('href')).toBe(
      '/a/acme/help/screening',
    );
  });

  it('explains the five design principles in the principles topic', () => {
    renderWithIntl(<HelpArticle audience="recruiter" agencySlug="acme" topic="principles" />);
    for (const heading of [
      /recruiter decides/i,
      /only when you ask/i,
      /draft until a person approves/i,
      /score is a reference/i,
      /facts are never changed/i,
    ])
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
  });
});
