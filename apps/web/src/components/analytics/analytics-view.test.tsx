// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { AnalyticsView } from './analytics-view';

const json = (body: unknown, status = 200) => Response.json(body, { status });
const api = '/api/v1/agencies/a1';
const r = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  value: denominator ? numerator / denominator : null,
});

const view = {
  range: { from: '2026-07-01', to: '2026-09-30' },
  filters: { clientId: null, positionId: null, ownerId: null },
  kpis: {
    timeToFill: { medianDays: 41, count: 1 },
    timeToInterview: { medianDays: null, count: 0 },
    outreachResponse: r(2, 3),
    submissionToInterview: r(3, 3),
    interviewToOffer: r(2, 3),
    offerAcceptance: r(1, 2),
    interviewToHire: r(1, 3),
    sourceToHire: r(1, 4),
    conversion: [{ from: 'sourced', to: 'contacted', rate: r(4, 4) }],
  },
  sources: [
    {
      source: 'linkedin',
      added: 3,
      contacted: 3,
      submitted: 2,
      interviewed: 2,
      offered: 1,
      hired: 1,
      hireRate: r(1, 3),
    },
  ],
  capacity: {
    weeks: 13,
    activePositionsPerRecruiter: 1.4,
    timePerPosition: { medianDays: 51, count: 1 },
    recruiters: [
      {
        userId: 'u1',
        name: 'Riley Recruiter',
        activePositionsPerWeek: 1.4,
        filled: 1,
        timePerPosition: { medianDays: 51, count: 1 },
      },
    ],
  },
};

function serve() {
  const stub = stubApi({
    [`GET ${api}/analytics`]: () => json({ data: view }),
    [`GET ${api}/clients`]: () =>
      json({
        data: [{ id: 'c1', name: 'Northwind', archivedAt: null, contacts: [], positionCount: 1 }],
      }),
    [`GET ${api}/members`]: () =>
      json({
        data: [
          {
            userId: 'u1',
            name: 'Riley Recruiter',
            email: 'r@x.com',
            role: 'recruiter',
            active: true,
          },
        ],
      }),
  });
  vi.stubGlobal('fetch', stub.impl);
  return stub;
}

afterEach(() => vi.unstubAllGlobals());

describe('AnalyticsView (US-1101, US-1102)', () => {
  it('shows the key figures, conversion, sources and capacity, with no accessibility violations', async () => {
    serve();
    const { container } = renderApp(
      <TooltipProvider>
        <AnalyticsView agencyId="a1" canFilterByRecruiter />
      </TooltipProvider>,
    );
    expect(await screen.findByText('41 days')).toBeTruthy();
    // Outreach response and interview-to-offer are both 2 of 3 in this view.
    expect(screen.getAllByText('2 of 3', { selector: 'span' })).toHaveLength(2);
    expect(screen.getByText('50%')).toBeTruthy();
    // A figure with nothing to measure says so instead of showing zero.
    expect(screen.getAllByText('No data in this period').length).toBeGreaterThan(0);
    expect(screen.getByRole('rowheader', { name: 'LinkedIn' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Riley Recruiter' })).toBeTruthy();
    // Every formula is readable without hovering.
    expect(screen.getByText(/Offers accepted ÷ offers made in this period/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'How Time to fill is calculated' })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('asks again with the chosen filters, and the downloads carry the same filters', async () => {
    const stub = serve();
    const user = userEvent.setup();
    renderApp(
      <TooltipProvider>
        <AnalyticsView agencyId="a1" canFilterByRecruiter />
      </TooltipProvider>,
    );
    await screen.findByText('41 days');
    await screen.findByRole('option', { name: 'Northwind' });
    await user.selectOptions(screen.getByLabelText('Client'), 'c1');
    await user.selectOptions(await screen.findByLabelText('Recruiter'), 'u1');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    await waitFor(() =>
      expect(
        stub.calls.some(
          (c) =>
            c.url.pathname === `${api}/analytics` &&
            c.url.searchParams.get('clientId') === 'c1' &&
            c.url.searchParams.get('ownerId') === 'u1',
        ),
      ).toBe(true),
    );
    const link = screen.getByRole('link', { name: 'Results by source (CSV)' });
    const href = new URL(link.getAttribute('href')!, 'http://localhost');
    expect(href.pathname).toBe(`${api}/analytics/export`);
    expect(Object.fromEntries(href.searchParams)).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
      clientId: 'c1',
      ownerId: 'u1',
      table: 'sources',
    });
  });

  it('offers no recruiter filter to a recruiter', async () => {
    serve();
    renderApp(
      <TooltipProvider>
        <AnalyticsView agencyId="a1" canFilterByRecruiter={false} />
      </TooltipProvider>,
    );
    await screen.findByText('41 days');
    expect(screen.queryByLabelText('Recruiter')).toBeNull();
  });
});
