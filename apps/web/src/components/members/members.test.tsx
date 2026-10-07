// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { AcceptInvite } from './accept-invite';
import { MembersView } from './members-view';

const push = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push }) }));

beforeEach(() => push.mockClear());
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) => Response.json(body, { status });
const agencyId = 'a1';
const base = `/api/v1/agencies/${agencyId}`;
const members = [
  {
    userId: 'u1',
    name: 'Ann Admin',
    email: 'ann@x.test',
    role: 'admin',
    active: true,
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    userId: 'u2',
    name: null,
    email: 'bob@x.test',
    role: 'recruiter',
    active: false,
    createdAt: '2026-10-02T00:00:00Z',
  },
];
const invites = [
  {
    id: 'i1',
    email: 'new@x.test',
    role: 'lead',
    expiresAt: '2026-10-20T00:00:00Z',
    createdAt: '2026-10-06T00:00:00Z',
  },
];

describe('MembersView', () => {
  const routes = () => ({
    [`GET ${base}/members`]: () => json({ data: members, nextCursor: null }),
    [`GET ${base}/invites`]: () => json({ data: invites }),
  });

  it('lists members read-only for leads: no invite, role editing or invitations', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${base}/members`]: routes()[`GET ${base}/members`] }).impl,
    );
    renderApp(<MembersView agencyId={agencyId} canManage={false} />);
    const table = await screen.findByRole('table', { name: 'Members' });
    expect(within(table).getByText('Ann Admin')).toBeTruthy();
    expect(within(table).getByText('bob@x.test', { selector: 'th' })).toBeTruthy(); // falls back to email when unnamed
    expect(screen.queryByRole('button', { name: 'Invite member' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Pending invitations')).toBeNull();
  });

  it('lets admins change a role', async () => {
    const api = stubApi({ ...routes(), [`PATCH ${base}/members/u2`]: () => json({ data: {} }) });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<MembersView agencyId={agencyId} canManage />);
    await user.selectOptions(await screen.findByLabelText('Role for bob@x.test'), 'lead');
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ role: 'lead' }),
    );
  });

  it('deactivates and reactivates via the row button', async () => {
    const api = stubApi({
      ...routes(),
      [`PATCH ${base}/members/u1`]: () => json({ data: {} }),
      [`PATCH ${base}/members/u2`]: () => json({ data: {} }),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<MembersView agencyId={agencyId} canManage />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate Ann Admin' }));
    await user.click(screen.getByRole('button', { name: 'Reactivate bob@x.test' }));
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([
        { active: false },
        { active: true },
      ]),
    );
  });

  it('explains why the last admin cannot be changed', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        ...routes(),
        [`PATCH ${base}/members/u1`]: () =>
          json({ error: { code: 'last_admin', message: 'x' } }, 409),
      }).impl,
    );
    const user = userEvent.setup();
    renderApp(<MembersView agencyId={agencyId} canManage />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate Ann Admin' }));
    expect(await screen.findByText('An agency needs at least one active admin.')).toBeTruthy();
  });

  it('shows pending invitations and revokes one', async () => {
    const api = stubApi({
      ...routes(),
      [`DELETE ${base}/invites/i1`]: () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<MembersView agencyId={agencyId} canManage />);
    expect(await screen.findByText('new@x.test')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Revoke the invitation for new@x.test' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  describe('invite dialog', () => {
    const openDialog = async () => {
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Invite member' }));
      await screen.findByRole('dialog', { name: 'Invite a member' });
      return user;
    };

    it('sends an invitation and confirms', async () => {
      const api = stubApi({
        ...routes(),
        [`POST ${base}/invites`]: () => json({ data: { id: 'i2' } }, 201),
      });
      vi.stubGlobal('fetch', api.impl);
      renderApp(<MembersView agencyId={agencyId} canManage />);
      const user = await openDialog();
      await user.type(screen.getByLabelText('Email'), 'Fresh@X.test');
      await user.selectOptions(screen.getByLabelText('Role'), 'lead');
      await user.click(screen.getByRole('button', { name: 'Send invitation' }));
      expect(await screen.findByText('Invitation sent to fresh@x.test.')).toBeTruthy();
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
        email: 'fresh@x.test',
        role: 'lead',
      });
    });

    it('rejects a bad email locally and shows duplicate invitations on the field', async () => {
      const api = stubApi({
        ...routes(),
        [`POST ${base}/invites`]: () =>
          json({ error: { code: 'invite_already_pending', message: 'x' } }, 409),
      });
      vi.stubGlobal('fetch', api.impl);
      renderApp(<MembersView agencyId={agencyId} canManage />);
      const user = await openDialog();
      await user.type(screen.getByLabelText('Email'), 'nope');
      await user.click(screen.getByRole('button', { name: 'Send invitation' }));
      await screen.findByRole('alert');
      expect(api.calls.some((c) => c.method === 'POST')).toBe(false);

      await user.clear(screen.getByLabelText('Email'));
      await user.type(screen.getByLabelText('Email'), 'dup@x.test');
      await user.click(screen.getByRole('button', { name: 'Send invitation' }));
      expect(await screen.findByText('This person already has a pending invitation.')).toBeTruthy();
    });
  });
});

describe('AcceptInvite', () => {
  const accept = '/api/v1/invites/acme/accept';

  it('accepts and opens the agency workbench', async () => {
    const api = stubApi({ [`POST ${accept}`]: () => json({ data: {} }) });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<AcceptInvite agencySlug="acme" agencyName="Acme Talent" token="tok" />);
    expect(screen.getByRole('heading', { name: 'Join Acme Talent' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/a/acme'));
    expect(api.calls[0]!.body).toEqual({ token: 'tok' });
  });

  it.each([
    [410, 'invite_expired', 'This invitation has expired. Ask an admin to send a new one.'],
    [
      403,
      'forbidden',
      'This invitation was sent to a different email address. Sign in with the invited address.',
    ],
    [409, 'invite_already_accepted', 'This invitation was already used.'],
  ])('explains a %s (%s) in plain words', async (status, code, text) => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`POST ${accept}`]: () => json({ error: { code, message: 'x' } }, status) }).impl,
    );
    const user = userEvent.setup();
    renderApp(<AcceptInvite agencySlug="acme" agencyName="Acme Talent" token="tok" />);
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', text);
    expect(push).not.toHaveBeenCalled();
  });

  it('falls back to the server message for other errors', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`POST ${accept}`]: () =>
          json({ error: { code: 'not_found', message: 'Invite not found' } }, 404),
      }).impl,
    );
    const user = userEvent.setup();
    renderApp(<AcceptInvite agencySlug="acme" agencyName="Acme Talent" token="tok" />);
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Invite not found');
  });
});
