// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { HealthView } from './health-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown) => Response.json(body);
const snapshot = {
  generatedAt: '2026-10-07T12:00:00.000Z',
  hours: 24,
  queues: [
    {
      queue: 'ai',
      queued: 2,
      running: 1,
      succeeded: 40,
      failed: 3,
      oldestQueuedAt: '2026-10-07T11:00:00.000Z',
    },
  ],
  failedJobs: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      queue: 'ai',
      name: 'match.batch',
      agencyId: 'a1',
      agencyName: 'Acme',
      createdAt: '2026-10-07T11:30:00.000Z',
    },
  ],
  agencies: [
    {
      agencyId: 'a1',
      agencyName: 'Acme',
      jobsFailed: 3,
      outbox: { failed: 1, bounced: 1, stuck: 2 },
      ai: { generations: 10, errors: 3, refusals: 1, errorRate: 0.3, refusalRate: 0.1 },
      needsAttention: true,
    },
    {
      agencyId: 'a2',
      agencyName: 'Globex',
      jobsFailed: 0,
      outbox: { failed: 0, bounced: 0, stuck: 0 },
      ai: { generations: 0, errors: 0, refusals: 0, errorRate: null, refusalRate: null },
      needsAttention: false,
    },
  ],
};

describe('HealthView (T-16-01, FR-ADM-09)', () => {
  it('shows queues, agencies that need a look first with their rates, and failed job ids', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ 'GET /api/admin/v1/health': () => json({ data: snapshot }) }).impl,
    );
    const { container } = renderApp(<HealthView />);
    const queues = await screen.findByRole('table', { name: 'Job queues' });
    expect(within(queues).getByRole('rowheader', { name: 'ai' })).toBeTruthy();
    const agencies = screen.getByRole('table', { name: 'Agencies' });
    const rows = within(agencies).getAllByRole('row');
    expect(rows[1]!.textContent).toContain('Acme');
    expect(rows[1]!.textContent).toContain('Needs a look');
    expect(rows[1]!.textContent).toContain('30%');
    expect(rows[2]!.textContent).toContain('Globex');
    expect(rows[2]!.textContent).not.toContain('Needs a look');
    expect(screen.getByText('11111111-1111-4111-8111-111111111111')).toBeTruthy();
    expect(screen.getByText('ai:match.batch')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('asks for the chosen period', async () => {
    const api = stubApi({ 'GET /api/admin/v1/health': () => json({ data: snapshot }) });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<HealthView />);
    await userEvent.selectOptions(await screen.findByLabelText('Period'), '168');
    await vi.waitFor(() =>
      expect(api.calls.some((c) => c.url.searchParams.get('hours') === '168')).toBe(true),
    );
  });
});
