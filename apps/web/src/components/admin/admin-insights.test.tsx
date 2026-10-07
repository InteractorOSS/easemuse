// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { AuditView } from './audit-view';
import { BudgetEditor } from './budget-editor';
import { UsageView } from './usage-view';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/usage',
  useRouter: () => ({ push: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe('UsageView', () => {
  const row = (key: string, cost: number, label: string | null = null) => ({
    key,
    label,
    calls: 3,
    inputTokens: 3000,
    outputTokens: 1500,
    cachedTokens: 0,
    costUsd: cost,
  });

  it('requests this month grouped by agency, lists rows and totals them', async () => {
    const api = stubApi({
      'GET /api/admin/v1/usage': () =>
        json({ data: [row('a1', 1.5, 'Acme'), row('a2', 0.25, 'Globex')] }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<UsageView today={new Date('2026-10-07T12:00:00Z')} />);
    const table = await screen.findByRole('table', { name: 'AI usage' });
    expect(within(table).getByText('Acme')).toBeTruthy();
    expect(within(table).getByRole('row', { name: /Total/ }).textContent).toContain('$1.75');
    const params = api.calls[0]!.url.searchParams;
    expect(params.get('from')).toBe('2026-10-01T00:00:00.000Z');
    expect(params.get('to')).toBe('2026-10-08T00:00:00.000Z'); // the "to" day is inclusive
    expect(params.get('groupBy')).toBe('agency');
  });

  it('regroups, and says so when there is no usage', async () => {
    const api = stubApi({
      'GET /api/admin/v1/usage': (url) =>
        json({ data: url.searchParams.get('groupBy') === 'purpose' ? [] : [row('a1', 1, 'Acme')] }),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<UsageView today={new Date('2026-10-07T12:00:00Z')} />);
    await screen.findByText('Acme');
    await user.selectOptions(screen.getByLabelText('Group by'), 'purpose');
    expect(await screen.findByText('No AI usage in this period.')).toBeTruthy();
  });

  it('does not call the API for an invalid range', async () => {
    const api = stubApi({ 'GET /api/admin/v1/usage': () => json({ data: [] }) });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<UsageView today={new Date('2026-10-07T12:00:00Z')} />);
    await screen.findByText('No AI usage in this period.');
    const before = api.calls.length;
    const from = screen.getByLabelText('From');
    await user.clear(from);
    await user.type(from, '2026-12-01');
    expect(api.calls.length).toBe(before);
  });
});

describe('AuditView', () => {
  const entry = (n: number) => ({
    id: `e${n}`,
    adminId: 'u',
    adminEmail: `admin${n}@x.test`,
    action: n === 1 ? 'agency.suspend' : 'agency.create',
    agencyId: 'a',
    agencyName: 'Acme',
    targetType: 'agency',
    targetId: 'a',
    data: null,
    createdAt: '2026-10-07T10:00:00.000Z',
  });

  it('lists who did what to which agency, filters by action and loads more', async () => {
    const api = stubApi({
      'GET /api/admin/v1/audit': (url) => {
        if (url.searchParams.get('cursor') === 'next')
          return json({ data: [entry(3)], nextCursor: null });
        if (url.searchParams.get('action') === 'agency.su')
          return json({ data: [entry(1)], nextCursor: null });
        return json({ data: [entry(1), entry(2)], nextCursor: 'next' });
      },
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<AuditView />);
    const table = await screen.findByRole('table', { name: 'Audit log' });
    expect(within(table).getByText('admin1@x.test')).toBeTruthy();
    expect(within(table).getAllByText('Acme')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('admin3@x.test')).toBeTruthy();
    await user.type(screen.getByLabelText('Action starts with'), 'agency.su');
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.searchParams.get('action') === 'agency.su')).toBe(true),
    );
  });

  it('says so when nothing matches', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ 'GET /api/admin/v1/audit': () => json({ data: [], nextCursor: null }) }).impl,
    );
    renderApp(<AuditView />);
    expect(await screen.findByText('No entries match.')).toBeTruthy();
  });
});

describe('BudgetEditor', () => {
  const status = (limitUsd: number | null, spentUsd = 80, level = 'warning') =>
    ({ limitUsd, spentUsd, ratio: limitUsd ? spentUsd / limitUsd : null, level }) as never;
  const path = '/api/admin/v1/agencies/a1/budget';

  it('shows the limit, the spend and how close it is', () => {
    renderApp(<BudgetEditor agencyId="a1" budget={status(100)} canWrite={false} />);
    expect(screen.getByText('Limit: $100.00')).toBeTruthy();
    expect(screen.getByText('Spent this month: $80.00')).toBeTruthy();
    expect(screen.getByText('Over 80% of the budget')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save budget' })).toBeNull(); // read-only for support
  });

  it('saves a new limit and can remove it', async () => {
    const api = stubApi({ [`PATCH ${path}`]: () => json({ data: {} }) });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<BudgetEditor agencyId="a1" budget={status(100)} canWrite />);
    const field = screen.getByLabelText('Limit in USD (leave empty for no limit)');
    await user.clear(field);
    await user.type(field, '250.5');
    await user.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(api.calls[0]!.body).toEqual({ aiMonthlyBudgetUsd: 250.5 }));
    await user.click(screen.getByRole('button', { name: 'Remove limit' }));
    await waitFor(() => expect(api.calls[1]!.body).toEqual({ aiMonthlyBudgetUsd: null }));
  });

  it('rejects numbers out of range without calling the API', async () => {
    const api = stubApi({ [`PATCH ${path}`]: () => json({ data: {} }) });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<BudgetEditor agencyId="a1" budget={status(null, 0, 'ok')} canWrite />);
    expect(screen.getByText('No limit')).toBeTruthy();
    const field = screen.getByLabelText('Limit in USD (leave empty for no limit)');
    for (const bad of ['-5', 'abc', '2000000']) {
      await user.clear(field);
      await user.type(field, bad);
      await user.click(screen.getByRole('button', { name: 'Save budget' }));
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Enter a number from 0 to 1,000,000.',
      );
    }
    expect(api.calls).toHaveLength(0);
  });
});
