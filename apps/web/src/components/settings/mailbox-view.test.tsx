// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { MailboxView } from './mailbox-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const api = '/api/v1/agencies/a1/mailbox';
const connected = (over: Record<string, unknown> = {}) => ({
  provider: 'google',
  address: 'sam@agency.test',
  status: 'active',
  lastSyncAt: '2026-10-20T12:00:00.000Z',
  ...over,
});
const view = (
  returning: { provider: 'google' | 'microsoft'; credentialId: string } | null = null,
) => renderApp(<MailboxView agencyId="a1" agencySlug="acme" returning={returning} />);

describe('MailboxView (T-5-12)', () => {
  it('offers both providers when nothing is connected, and sends the person to sign in', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const stub = stubApi({
      [`GET ${api}`]: () => json(null),
      [`POST ${api}/connect`]: () => json({ authorizationUrl: 'https://accounts.example/auth' }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const { container } = view();
    await user.click(await screen.findByRole('button', { name: 'Connect Microsoft 365' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.example/auth'));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ provider: 'microsoft' });
    await expectNoA11yViolations(container);
  });

  it('shows the connected address and when replies were last checked, and disconnects', async () => {
    const stub = stubApi({
      [`GET ${api}`]: () => json(connected()),
      [`DELETE ${api}`]: () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const { container } = view();
    expect(await screen.findByText('Connected: sam@agency.test (Gmail)')).toBeTruthy();
    expect(screen.getByText(/Replies were last checked/)).toBeTruthy();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  it('asks to connect again when the sign-in stopped working', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${api}`]: () => json(connected({ status: 'needs_reconnect' })) }).impl,
    );
    view();
    expect((await screen.findByRole('alert')).textContent).toMatch(/sign-in stopped working/);
    expect(screen.getByRole('button', { name: 'Connect again: Gmail' })).toBeTruthy();
  });

  it('records the connection when the person comes back from the provider', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const stub = stubApi({
      [`GET ${api}`]: () => json(connected()),
      [`POST ${api}`]: () => json(connected(), 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    view({ provider: 'google', credentialId: 'cred-7' });
    await waitFor(() =>
      expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({
        provider: 'google',
        credentialId: 'cred-7',
      }),
    );
    await waitFor(() =>
      expect(replaceState).toHaveBeenCalledWith(null, '', '/a/acme/settings/mailbox'),
    );
    expect(stub.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('says so when the sign-in is not the person’s own', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}`]: () => json(null),
        [`POST ${api}`]: () =>
          Response.json({ error: { code: 'forbidden', message: 'x' } }, { status: 403 }),
      }).impl,
    );
    view({ provider: 'google', credentialId: 'someone-elses' });
    expect((await screen.findByRole('alert')).textContent).toMatch(/does not belong to you/);
  });
});
