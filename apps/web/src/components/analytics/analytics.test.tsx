// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { AnalyticsView } from './analytics-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const ratio = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});
const result = (over: Record<string, unknown> = {}) => ({
  range: { from: '2026-07-10', to: '2026-10-07' },
  recruiterId: null,
  entryCount: 8,
  kpis: {
    timeToFill: { count: 2, medianDays: 50 },
    timeToInterview: { count: 0, medianDays: null },
    outreachResponseRate: ratio(5, 6),
    submissionToInterview: ratio(3, 4),
    interviewToOffer: ratio(2, 3),
    offerAcceptance: ratio(0, 0),
    interviewToHire: ratio(1, 3),
    sourceToHire: ratio(1, 8),
  },
  stages: [
    { stage: 'sourced', reached: 8, conversion: null },
    { stage: 'screened', reached: 6, conversion: ratio(6, 8) },
  ],
  sources: [
    {
      source: 'linkedin',
      added: 4,
      contacted: 3,
      submitted: 2,
      interviewed: 2,
      offered: 1,
      hired: 1,
      conversions: {
        contacted: ratio(3, 4),
        submitted: ratio(2, 3),
        interviewed: ratio(2, 2),
        offered: ratio(1, 2),
        hired: ratio(1, 1),
      },
      sourceToHire: ratio(1, 4),
    },
  ],
  capacity: [
    {
      recruiterId: null,
      name: null,
      positionsPerWeek: 2.5,
      weeks: 13,
      timePerPosition: { count: 1, medianDays: 20 },
    },
    {
      recruiterId: 'r1',
      name: 'Jane Recruiter',
      positionsPerWeek: null,
      weeks: 13,
      timePerPosition: { count: 0, medianDays: null },
    },
  ],
  recruiters: [{ id: 'r1', name: 'Jane Recruiter' }],
  ...over,
});
const base = '/api/v1/agencies/a1';
const routes = (data = result()) => ({
  [`GET ${base}/analytics`]: () => json({ data }),
  [`GET ${base}/clients`]: () => json({ data: [{ id: 'c1', name: 'Northwind' }] }),
  [`GET ${base}/positions`]: () => json({ data: [{ id: 'p1', title: 'HR Director' }] }),
});
const view = (canPickRecruiter = true) =>
  renderApp(
    <TooltipProvider>
      <AnalyticsView agencyId="a1" canPickRecruiter={canPickRecruiter} />
    </TooltipProvider>,
  );

describe('AnalyticsView (T-11-04)', () => {
  it('shows the KPIs with their counts, "no data" instead of 0%, and the formula for each', async () => {
    vi.stubGlobal('fetch', stubApi(routes()).impl);
    const { container } = view();
    expect(await screen.findByText('Time-to-Fill')).toBeTruthy();
    expect(screen.getByText('50 days')).toBeTruthy();
    expect(screen.getByText('83.3%')).toBeTruthy();
    expect(screen.getByText('5 of 6')).toBeTruthy();
    // Offer acceptance has nothing to divide by: no percentage is invented.
    const offer = screen.getByText('Offer Acceptance Rate').closest('div')!;
    expect(within(offer).getByText('No data yet')).toBeTruthy();
    expect(screen.getAllByText(/Offers accepted ÷ offers made/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Formula for Time-to-Fill' })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('shows the funnel, the source table and the capacity panel', async () => {
    vi.stubGlobal('fetch', stubApi(routes()).impl);
    view();
    const stages = await screen.findByRole('table', { name: /Candidates reaching each stage/ });
    expect(within(stages).getByText('Screened')).toBeTruthy();
    expect(within(stages).getByText('75%')).toBeTruthy();
    const sources = screen.getByRole('table', { name: /Candidates added, and how far/ });
    expect(within(sources).getByText('LinkedIn')).toBeTruthy();
    const capacity = screen.getByRole('table', { name: /Positions in sourcing/ });
    expect(within(capacity).getByText('Everyone')).toBeTruthy();
    expect(within(capacity).getByText('2.5')).toBeTruthy();
    expect(within(capacity).getByText('20 days')).toBeTruthy();
    expect(within(capacity).getByText('Jane Recruiter')).toBeTruthy();
  });

  it('sends the filters and links each CSV to the same filters', async () => {
    const api = stubApi(routes());
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    view();
    await screen.findByText('Time-to-Fill');
    await user.selectOptions(screen.getByLabelText('Client'), 'c1');
    await waitFor(() =>
      expect(
        api.calls
          .filter((c) => c.url.pathname.endsWith('/analytics'))
          .at(-1)!
          .url.searchParams.get('clientId'),
      ).toBe('c1'),
    );
    await user.selectOptions(await screen.findByLabelText('Recruiter'), 'r1');
    await waitFor(() =>
      expect(
        api.calls
          .filter((c) => c.url.pathname.endsWith('/analytics'))
          .at(-1)!
          .url.searchParams.get('recruiterId'),
      ).toBe('r1'),
    );
    const link = screen.getByRole('link', { name: 'Key figures (CSV)' });
    const href = new URL(link.getAttribute('href')!, 'http://x.test');
    expect(href.pathname).toBe(`${base}/analytics/export`);
    expect(href.searchParams.get('table')).toBe('kpis');
    expect(href.searchParams.get('clientId')).toBe('c1');
    expect(href.searchParams.get('recruiterId')).toBe('r1');
    expect(href.searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives a recruiter their own figures and no recruiter filter', async () => {
    vi.stubGlobal('fetch', stubApi(routes(result({ recruiters: [] }))).impl);
    view(false);
    await screen.findByText('Time-to-Fill');
    expect(screen.queryByLabelText('Recruiter')).toBeNull();
    expect(screen.getByText('You see your own figures.')).toBeTruthy();
  });
});
