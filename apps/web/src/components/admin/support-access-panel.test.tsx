// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { SupportAccessPanel } from './support-access-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const path = '/api/admin/v1/agencies/a1/support-access';
const grant = (id: string, status: string, adminId = 'me') => ({
  id,
  adminId,
  adminEmail: `${adminId}@wakers.test`,
  reason: 'A report did not load',
  requestedHours: 4,
  status,
  createdAt: '2026-10-07T09:00:00.000Z',
  expiresAt: status === 'active' ? '2026-10-07T13:00:00.000Z' : null,
  decidedAt: null,
});
const panel = () => <SupportAccessPanel agencyId="a1" agencySlug="acme" userId="me" />;

describe('SupportAccessPanel (T-13-07, FR-ADM-07)', () => {
  it('asks for access with a reason and an expiry, and refuses a reason that is too short', async () => {
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: [] }),
      [`POST ${path}`]: () => json({ data: grant('g1', 'pending') }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(panel());
    const reason = await screen.findByLabelText(/Why do you need to look/);
    await userEvent.type(reason, 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agency admin' }));
    expect(await screen.findByText('Say why, in at least 10 characters.')).toBeTruthy();
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await userEvent.clear(reason);
    await userEvent.type(reason, 'A report did not load for the customer');
    await userEvent.selectOptions(screen.getByLabelText('How long'), '48');
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agency admin' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
        reason: 'A report did not load for the customer',
        hours: 48,
      }),
    );
  });

  it('shows an open workspace link and an end button only on my active grant, and no new request form', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () =>
          json({ data: [grant('g1', 'active'), grant('g2', 'active', 'someone-else')] }),
      }).impl,
    );
    const { container } = renderApp(panel());
    const link = await screen.findByRole('link', { name: 'Open the workspace' });
    expect(link.getAttribute('href')).toBe('/a/acme');
    expect(screen.getAllByRole('button', { name: 'End access' })).toHaveLength(1);
    expect(screen.queryByLabelText(/Why do you need to look/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('lets me withdraw a pending request', async () => {
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: [grant('g1', 'pending')] }),
      [`DELETE ${path}/g1`]: () => json({ data: grant('g1', 'revoked') }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw request' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true));
  });
});
