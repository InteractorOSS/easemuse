// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { AdminShell } from './admin-shell';
import { AgenciesView } from './agencies-view';
import { AgencyDetailView } from './agency-detail-view';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/agencies',
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

const agency = (n: number, status = 'active') => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  slug: `acme-${n}`,
  name: `Acme ${n}`,
  status,
  region: 'us',
  plan: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  activeMembers: n,
});
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe('AdminShell', () => {
  it('shows the admin frame with the current section marked', () => {
    renderApp(
      <AdminShell userName="Pat" role="owner">
        <p>content</p>
      </AdminShell>,
    );
    expect(screen.getByText('Platform admin')).toBeTruthy();
    expect(screen.getByText('Signed in as Pat (Owner)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Agencies' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(screen.getByRole('main')).getByText('content')).toBeTruthy();
  });
});

describe('AgenciesView', () => {
  it('lists agencies in an accessible table and links to detail', async () => {
    const api = stubApi({
      'GET /api/admin/v1/agencies': () =>
        json({ data: [agency(1), agency(2, 'suspended')], nextCursor: null }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<AgenciesView canWrite />);
    const table = await screen.findByRole('table', { name: 'Agencies' });
    expect(within(table).getByRole('link', { name: 'Acme 1' }).getAttribute('href')).toContain(
      '/admin/agencies/',
    );
    expect(within(table).getByText('Suspended')).toBeTruthy();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toContain('Members');
    expect(screen.getByRole('button', { name: 'Create agency' })).toBeTruthy();
  });

  it('hides create for read-only (support) users', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ 'GET /api/admin/v1/agencies': () => json({ data: [], nextCursor: null }) }).impl,
    );
    renderApp(<AgenciesView canWrite={false} />);
    expect(await screen.findByText('No agencies match.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create agency' })).toBeNull();
  });

  it('searches (debounced), filters by status and loads more pages with the cursor', async () => {
    const api = stubApi({
      'GET /api/admin/v1/agencies': (url) => {
        if (url.searchParams.get('cursor') === 'next')
          return json({ data: [agency(3)], nextCursor: null });
        return json({ data: [agency(1)], nextCursor: url.searchParams.get('q') ? null : 'next' });
      },
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<AgenciesView canWrite />);
    await screen.findByText('Acme 1');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Acme 3');

    await user.type(screen.getByLabelText('Search agencies'), 'acme');
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.searchParams.get('q') === 'acme')).toBe(true),
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'suspended');
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.searchParams.get('status') === 'suspended')).toBe(true),
    );
  });

  it('shows an error with retry when loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/admin/v1/agencies': () =>
          json({ error: { code: 'internal_error', message: 'x' } }, 500),
      }).impl,
    );
    renderApp(<AgenciesView canWrite />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  describe('create dialog', () => {
    const open = async () => {
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Create agency' }));
      return { user, dialog: await screen.findByRole('dialog', { name: 'Create agency' }) };
    };
    const fill = async (user: ReturnType<typeof userEvent.setup>, slug = 'new-agency') => {
      await user.type(screen.getByLabelText('Agency name'), 'New Agency');
      await user.type(screen.getByLabelText('URL name'), slug);
      await user.type(screen.getByLabelText("First admin's email"), 'boss@new.test');
    };

    it('validates with the shared schema before calling the API', async () => {
      const api = stubApi({
        'GET /api/admin/v1/agencies': () => json({ data: [], nextCursor: null }),
      });
      vi.stubGlobal('fetch', api.impl);
      renderApp(<AgenciesView canWrite />);
      const { user } = await open();
      await user.type(screen.getByLabelText('URL name'), 'Bad Slug!');
      await user.click(screen.getByRole('button', { name: 'Create and invite' }));
      expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
      expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('creates the agency, confirms and refreshes the list', async () => {
      const api = stubApi({
        'GET /api/admin/v1/agencies': () => json({ data: [], nextCursor: null }),
        'POST /api/admin/v1/agencies': () => json({ data: { id: 'x' } }, 201),
      });
      vi.stubGlobal('fetch', api.impl);
      renderApp(<AgenciesView canWrite />);
      const { user } = await open();
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Create and invite' }));
      expect(
        await screen.findByText('Agency created. Invitation sent to boss@new.test.'),
      ).toBeTruthy();
      const post = api.calls.find((c) => c.method === 'POST')!;
      expect(post.body).toEqual({
        name: 'New Agency',
        slug: 'new-agency',
        adminEmail: 'boss@new.test',
        region: 'us',
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(api.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1);
    });

    it('shows a taken URL name on the slug field', async () => {
      vi.stubGlobal(
        'fetch',
        stubApi({
          'GET /api/admin/v1/agencies': () => json({ data: [], nextCursor: null }),
          'POST /api/admin/v1/agencies': () =>
            json(
              {
                error: { code: 'slug_taken', message: 'taken', fields: { slug: 'Already taken' } },
              },
              409,
            ),
        }).impl,
      );
      renderApp(<AgenciesView canWrite />);
      const { user } = await open();
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Create and invite' }));
      expect(await screen.findByText('This URL name is already taken.')).toBeTruthy();
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });
});

describe('AgencyDetailView', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const budget = { spentUsd: 12.5, limitUsd: 100, ratio: 0.125, level: 'ok' };
  const detail = (status: string) => ({
    data: { ...agency(1, status), pendingInvites: 2, budget },
  });

  it('shows metadata and counts', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET /api/admin/v1/agencies/${id}`]: () => json(detail('active')) }).impl,
    );
    renderApp(<AgencyDetailView agencyId={id} canWrite />);
    expect(await screen.findByRole('heading', { name: 'Acme 1' })).toBeTruthy();
    expect(screen.getByText('acme-1')).toBeTruthy();
    expect(screen.getByText('Pending invitations').nextElementSibling?.textContent).toBe('2');
  });

  it('suspends with a required reason', async () => {
    let status = 'active';
    const api = stubApi({
      [`GET /api/admin/v1/agencies/${id}`]: () => json(detail(status)),
      [`POST /api/admin/v1/agencies/${id}/suspend`]: () => {
        status = 'suspended';
        return json({ data: {} });
      },
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<AgencyDetailView agencyId={id} canWrite />);
    await user.click(await screen.findByRole('button', { name: 'Suspend' }));
    const confirm = within(
      await screen.findByRole('dialog', { name: 'Suspend Acme 1?' }),
    ).getByRole('button', { name: 'Suspend' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Reason (kept in the audit log)'), 'Unpaid invoice');
    await user.click(confirm);
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
        reason: 'Unpaid invoice',
      }),
    );
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeTruthy();
  });

  it('offers reactivate for a suspended agency, and nothing to read-only users', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET /api/admin/v1/agencies/${id}`]: () => json(detail('suspended')) }).impl,
    );
    const { unmount } = renderApp(<AgencyDetailView agencyId={id} canWrite />);
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeTruthy();
    unmount();
    renderApp(<AgencyDetailView agencyId={id} canWrite={false} />);
    await screen.findByRole('heading', { name: 'Acme 1' });
    expect(screen.queryByRole('button', { name: 'Reactivate' })).toBeNull();
    fireEvent.click(document.body);
  });
});
