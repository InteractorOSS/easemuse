// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminBillingPanel } from '@/components/admin/billing-panel';
import { PlanAndSeats } from '@/components/settings/plan-and-seats';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });

const overview = (over: Record<string, unknown> = {}) => ({
  connected: true,
  mode: 'live',
  plan: {
    id: 'p1',
    name: 'Team',
    status: 'active',
    syncedAt: '2026-10-07T04:00:00.000Z',
    error: null,
  },
  seats: { active: 4, pending: 1, limit: 5 },
  usage: {
    month: '2026-10',
    aiCostUsd: 12.34,
    reportedCents: 1200,
    failedReports: 0,
    lastReportedAt: '2026-10-07T04:00:00.000Z',
  },
  invoices: [
    {
      id: 'c1',
      kind: 'subscription',
      amount: '399.00',
      currency: 'USD',
      status: 'paid',
      periodStart: '2026-09-01',
      periodEnd: '2026-10-01',
      issuedAt: '2026-10-01',
      paidAt: '2026-10-02',
    },
  ],
  ...over,
});

describe('PlanAndSeats (US-1308, FR-TEN-05)', () => {
  const path = '/api/v1/agencies/a1/billing';

  it("shows the plan, seats used against the limit, this month's usage and the invoices", async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${path}`]: () => json({ data: overview() }) }).impl);
    const { container } = renderApp(<PlanAndSeats agencyId="a1" />);
    expect(await screen.findByText('Team')).toBeTruthy();
    expect(screen.getByText(/4 of 5 seats in use/)).toBeTruthy();
    expect(screen.getByText(/1 invitation is open and holds a seat/)).toBeTruthy();
    expect(screen.getByText(/No free seat/)).toBeTruthy();
    expect(screen.getByText('AI cost this month: $12.34.')).toBeTruthy();
    expect(screen.getByText('399.00 USD')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('says so when billing is not connected, and when invoices or reports are the problem', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () =>
          json({
            data: overview({
              connected: false,
              plan: null,
              invoices: null,
              seats: { active: 2, pending: 0, limit: null },
              usage: {
                month: '2026-10',
                aiCostUsd: 0,
                reportedCents: 0,
                failedReports: 2,
                lastReportedAt: null,
              },
            }),
          }),
      }).impl,
    );
    renderApp(<PlanAndSeats agencyId="a1" />);
    expect(await screen.findByText(/Billing is not connected yet/)).toBeTruthy();
    expect(screen.getByText('No plan has been assigned yet.')).toBeTruthy();
    expect(screen.getByText(/2 seats in use. Your plan sets no limit/)).toBeTruthy();
    expect(screen.getByText('Invoices could not be loaded just now.')).toBeTruthy();
    expect(screen.getByText(/2 reports to Billing have not gone through yet/)).toBeTruthy();
  });
});

describe('AdminBillingPanel', () => {
  const path = '/api/admin/v1/agencies/a1/billing';
  const plans = [
    { id: 'plan-starter', name: 'Starter', metrics: [] },
    { id: 'plan-team', name: 'Team', metrics: [] },
  ];

  it('puts the agency on the chosen plan', async () => {
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: { overview: overview({ plan: null }), plans } }),
      [`POST ${path}/plan`]: () => json({ data: {} }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<AdminBillingPanel agencyId="a1" canWrite />);
    const assign = await screen.findByRole('button', { name: 'Put on this plan' });
    expect((assign as HTMLButtonElement).disabled).toBe(true);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Plan' }), 'plan-team');
    await userEvent.click(assign);
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ planId: 'plan-team' }),
    );
  });

  it('can read the plan again, and shows nothing to change for a read-only administrator or without a connection', async () => {
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: { overview: overview(), plans } }),
      [`POST ${path}/refresh`]: () => json({ data: {} }),
    });
    vi.stubGlobal('fetch', api.impl);
    const first = renderApp(<AdminBillingPanel agencyId="a1" canWrite />);
    await userEvent.click(await screen.findByRole('button', { name: 'Read again from Billing' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.pathname.endsWith('/refresh'))).toBe(true),
    );
    first.unmount();

    renderApp(<AdminBillingPanel agencyId="a1" canWrite={false} />);
    await screen.findByText('Team');
    expect(screen.queryByRole('button', { name: 'Put on this plan' })).toBeNull();
  });

  it('tells the administrator when the agency has to be moved in Billing Server', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () => json({ data: { overview: overview(), plans } }),
        [`POST ${path}/plan`]: () =>
          json({ error: { code: 'plan_change_unsupported', message: 'x' } }, 409),
      }).impl,
    );
    renderApp(<AdminBillingPanel agencyId="a1" canWrite />);
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Plan' }),
      'plan-starter',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Put on this plan' }));
    expect(await screen.findByText(/Change it in Billing Server/)).toBeTruthy();
  });
});
