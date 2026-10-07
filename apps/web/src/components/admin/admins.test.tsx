// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { AcceptAdminInvite } from './accept-admin-invite';
import { AdminShell } from './admin-shell';
import { AdminsView } from './admins-view';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/admins',
  useRouter: () => ({ push }),
}));
beforeEach(() => push.mockClear());
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });

const admins = [
  { userId: 'u1', email: 'owner@x.test', name: 'Olive Owner', role: 'owner' },
  { userId: 'u2', email: 'sam@x.test', name: null, role: 'support' },
];
const invites = [
  { id: 'i1', email: 'new@x.test', role: 'admin', expiresAt: '2026-10-20T00:00:00Z' },
];
const listing = () => json({ data: { admins, invites } });

describe('AdminShell navigation', () => {
  it('shows Administrators to owners only', () => {
    const { unmount } = renderApp(
      <AdminShell userName="Pat" role="owner">
        <p>x</p>
      </AdminShell>,
    );
    expect(screen.getByRole('link', { name: 'Administrators' })).toBeTruthy();
    unmount();
    renderApp(
      <AdminShell userName="Pat" role="admin">
        <p>x</p>
      </AdminShell>,
    );
    expect(screen.queryByRole('link', { name: 'Administrators' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Audit log' })).toBeTruthy();
  });
});

describe('AdminsView', () => {
  it('lists administrators and pending invitations, marking the current user', async () => {
    vi.stubGlobal('fetch', stubApi({ 'GET /api/admin/v1/admins': listing }).impl);
    renderApp(<AdminsView currentUserId="u1" />);
    const table = await screen.findByRole('table', { name: 'Platform administrators' });
    expect(within(table).getByText('Olive Owner (you)')).toBeTruthy();
    expect(within(table).getByText('sam@x.test', { selector: 'th' })).toBeTruthy();
    expect(screen.getByText('new@x.test')).toBeTruthy();
  });

  it('changes a role, removes an administrator and revokes an invitation', async () => {
    const api = stubApi({
      'GET /api/admin/v1/admins': listing,
      'PATCH /api/admin/v1/admins/u2': () => json({ data: {} }),
      'DELETE /api/admin/v1/admins/u2': () => new Response(null, { status: 204 }),
      'DELETE /api/admin/v1/admin-invites/i1': () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<AdminsView currentUserId="u1" />);
    await user.selectOptions(await screen.findByLabelText('Role for sam@x.test'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Remove sam@x.test' }));
    await user.click(screen.getByRole('button', { name: 'Revoke the invitation for new@x.test' }));
    await waitFor(() =>
      expect(
        api.calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.url.pathname]),
      ).toEqual([
        ['PATCH', '/api/admin/v1/admins/u2'],
        ['DELETE', '/api/admin/v1/admins/u2'],
        ['DELETE', '/api/admin/v1/admin-invites/i1'],
      ]),
    );
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ role: 'admin' });
  });

  it('explains why the last owner cannot be changed', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/admin/v1/admins': listing,
        'PATCH /api/admin/v1/admins/u1': () =>
          json({ error: { code: 'last_owner', message: 'x' } }, 409),
      }).impl,
    );
    const user = userEvent.setup();
    renderApp(<AdminsView currentUserId="u1" />);
    await user.selectOptions(await screen.findByLabelText('Role for Olive Owner'), 'admin');
    expect(await screen.findByText('The platform needs at least one owner.')).toBeTruthy();
  });

  it('creates an invitation and shows the one-time link to copy', async () => {
    const api = stubApi({
      'GET /api/admin/v1/admins': listing,
      'POST /api/admin/v1/admins': () =>
        json(
          {
            data: { invite: { id: 'i2' }, acceptUrl: 'https://app.test/admin-invite?token=abc123' },
          },
          201,
        ),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<AdminsView currentUserId="u1" />);
    await user.click(await screen.findByRole('button', { name: 'Invite administrator' }));
    await user.type(screen.getByLabelText('Email'), 'Fresh@X.test');
    await user.selectOptions(screen.getByLabelText('Role'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Create invitation' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
        email: 'fresh@x.test',
        role: 'admin',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Send this link' });
    expect((within(dialog).getByLabelText('Send this link') as HTMLInputElement).value).toBe(
      'https://app.test/admin-invite?token=abc123',
    );
    expect(
      within(dialog).getByText(
        'Copy it now and send it to fresh@x.test. It is shown only once and works once.',
      ),
    ).toBeTruthy();
  });

  it('shows duplicate-invite and already-admin errors in the dialog', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/admin/v1/admins': listing,
        'POST /api/admin/v1/admins': () =>
          json({ error: { code: 'already_admin', message: 'x' } }, 409),
      }).impl,
    );
    const user = userEvent.setup();
    renderApp(<AdminsView currentUserId="u1" />);
    await user.click(await screen.findByRole('button', { name: 'Invite administrator' }));
    await user.type(screen.getByLabelText('Email'), 'sam@x.test');
    await user.click(screen.getByRole('button', { name: 'Create invitation' }));
    expect(await screen.findByText('This person is already an administrator.')).toBeTruthy();
  });
});

describe('AcceptAdminInvite', () => {
  const route = 'POST /api/v1/platform-invites/accept';
  it('accepts and opens /admin', async () => {
    const api = stubApi({ [route]: () => json({ data: { role: 'admin' } }) });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<AcceptAdminInvite token="tok" />);
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin'));
    expect(api.calls[0]!.body).toEqual({ token: 'tok' });
  });

  it.each([
    ['invite_expired', 410, 'This invitation has expired. Ask an owner for a new one.'],
    [
      'forbidden',
      403,
      'This invitation was sent to a different email address. Sign in with the invited address.',
    ],
    ['invite_already_accepted', 409, 'This invitation was already used.'],
  ])('explains %s in plain words', async (code, status, text) => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [route]: () => json({ error: { code, message: 'x' } }, status) }).impl,
    );
    const user = userEvent.setup();
    renderApp(<AcceptAdminInvite token="tok" />);
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect((await screen.findByRole('alert')).textContent).toBe(text);
    expect(push).not.toHaveBeenCalled();
  });
});
