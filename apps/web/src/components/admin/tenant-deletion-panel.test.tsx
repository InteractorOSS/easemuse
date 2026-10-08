// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { DeletionsView } from './deletions-view';
import { TenantDeletionPanel } from './tenant-deletion-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const path = '/api/admin/v1/agencies/a1/deletion';
const record = (status: string, requestedById = 'me', over: Record<string, unknown> = {}) => ({
  id: 'd1',
  tenantId: 'a1',
  tenantSlug: 'acme',
  tenantName: 'Acme',
  status,
  requestedById,
  requestedByEmail: 'ann@wakers.test',
  requestedAt: '2026-10-07T09:00:00.000Z',
  approvedByEmail: null,
  approvedAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  error: null,
  rowsRemoved: 0,
  ...over,
});
const panel = (status = 'suspended') => (
  <TenantDeletionPanel agencyId="a1" agencySlug="acme" agencyStatus={status} userId="me" />
);

describe('TenantDeletionPanel (T-13-10, FR-ADM-08)', () => {
  it('shows nothing for an active agency without a deletion', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${path}`]: () => json({ data: null }) }).impl);
    const { container } = renderApp(panel('active'));
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('asks only once the agency URL name is typed exactly', async () => {
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: null }),
      [`POST ${path}`]: () => json({ data: record('requested') }, 201),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(panel());
    const button = await screen.findByRole('button', { name: 'Ask for deletion' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    const input = screen.getByLabelText('Type acme to confirm');
    await userEvent.type(input, 'acm');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(input, 'e');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ confirmSlug: 'acme' }),
    );
  });

  it('tells the person who asked to wait for a second one, and can cancel', async () => {
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: record('requested', 'me') }),
      [`DELETE ${path}/d1`]: () => json({ data: record('cancelled') }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(panel());
    expect(await screen.findByText(/A different owner or admin has to approve/)).toBeTruthy();
    expect(screen.queryByLabelText('Type acme to confirm')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  it('lets a different person approve by typing the name, and passes axe', async () => {
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: record('requested', 'someone-else') }),
      [`POST ${path}/d1/approve`]: () => json({ data: record('approved', 'someone-else') }),
    });
    vi.stubGlobal('fetch', api.impl);
    const { container } = renderApp(panel());
    await userEvent.type(await screen.findByLabelText('Type acme to confirm'), 'acme');
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Approve and delete everything' }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ confirmSlug: 'acme' }),
    );
  });

  it('shows progress while it runs, and a failure with a way to ask again', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () => json({ data: record('running', 'x', { rowsRemoved: 120 }) }),
      }).impl,
    );
    const first = renderApp(panel());
    expect(await screen.findByText(/120 rows removed so far/)).toBeTruthy();
    first.unmount();
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${path}`]: () => json({ data: record('failed', 'x') }) }).impl,
    );
    renderApp(panel());
    expect(await screen.findByText(/stopped with an error/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask for deletion' })).toBeTruthy();
  });
});

describe('DeletionsView', () => {
  it('lists who asked, who approved and how many rows went', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/admin/v1/tenant-deletions': () =>
          json({
            data: [
              record('completed', 'x', {
                approvedByEmail: 'bo@wakers.test',
                completedAt: '2026-10-08T00:00:00.000Z',
                rowsRemoved: 4321,
              }),
            ],
          }),
      }).impl,
    );
    const { container } = renderApp(<DeletionsView />);
    expect(await screen.findByText('Acme')).toBeTruthy();
    expect(screen.getByText('ann@wakers.test')).toBeTruthy();
    expect(screen.getByText('bo@wakers.test')).toBeTruthy();
    expect(screen.getByText('4,321')).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
