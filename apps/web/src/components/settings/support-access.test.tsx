// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { SupportAccess } from './support-access';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const path = '/api/v1/agencies/a1/support-access';
const grant = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  adminId: 'p1',
  adminEmail: 'sam@wakers.test',
  reason: 'A report did not load',
  requestedHours: 4,
  status,
  createdAt: '2026-10-07T09:00:00.000Z',
  expiresAt: status === 'active' ? '2026-10-07T13:00:00.000Z' : null,
  decidedAt: null,
  ...over,
});

describe('SupportAccess (T-13-07, FR-TEN-07)', () => {
  it('lets an admin approve a pending request, and sends the decision', async () => {
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: { grants: [grant('g1', 'pending')], views: [] } }),
      [`POST ${path}/g1/decision`]: () => json({ data: grant('g1', 'active') }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<SupportAccess agencyId="a1" />);
    expect(await screen.findByText('sam@wakers.test')).toBeTruthy();
    expect(screen.getByText('Waiting for your answer')).toBeTruthy();
    expect(screen.getByText('A report did not load')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Approve for 4 hours' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ decision: 'approve' }),
    );
  });

  it('offers deny on a pending request and revoke on an active grant, nothing on a finished one', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () =>
          json({
            data: {
              grants: [grant('g1', 'pending'), grant('g2', 'active'), grant('g3', 'expired')],
              views: [],
            },
          }),
      }).impl,
    );
    renderApp(<SupportAccess agencyId="a1" />);
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]!).getByRole('button', { name: 'Deny' })).toBeTruthy();
    expect(within(items[1]!).getByRole('button', { name: 'End access now' })).toBeTruthy();
    expect(within(items[2]!).queryByRole('button')).toBeNull();
  });

  it('lists every read made under a grant, and passes axe', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () =>
          json({
            data: {
              grants: [grant('g2', 'active')],
              views: [
                {
                  id: 'v1',
                  at: '2026-10-07T09:30:00.000Z',
                  adminId: 'p1',
                  adminEmail: 'sam@wakers.test',
                  method: 'GET',
                  path: '/a/acme/candidates',
                },
              ],
            },
          }),
      }).impl,
    );
    const { container } = renderApp(<SupportAccess agencyId="a1" />);
    expect(await screen.findByText('GET /a/acme/candidates')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('says so when nobody asked and nothing was viewed', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${path}`]: () => json({ data: { grants: [], views: [] } }) }).impl,
    );
    renderApp(<SupportAccess agencyId="a1" />);
    expect(await screen.findByText('Nobody has asked for access.')).toBeTruthy();
    expect(screen.getByText('Nothing has been viewed.')).toBeTruthy();
  });
});
