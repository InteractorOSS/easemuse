// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { TasksView } from './tasks-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const task = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'outreach_due',
  entityType: 'pipeline_entry',
  entityId: 'e1',
  entityLabel: 'Jane Doe: Staff Engineer',
  dueAt: '2026-10-07T09:00:00.000Z',
  snoozedUntil: null,
  overdue: false,
  ...over,
});
const list = '/api/v1/agencies/a1/tasks';

describe('TasksView', () => {
  it('lists today’s tasks with what they are about and flags overdue ones', async () => {
    const api = stubApi({
      [`GET ${list}`]: () =>
        json({
          data: [
            task('t1', { overdue: true }),
            task('t2', { kind: 'interview', entityLabel: null }),
          ],
        }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<TasksView agencyId="a1" />);
    expect(await screen.findByText('Follow-up due: Jane Doe: Staff Engineer')).toBeTruthy();
    expect(screen.getByText('Interview')).toBeTruthy();
    expect(screen.getAllByText(/Overdue/)).toHaveLength(1);
    expect(api.calls[0]!.url.searchParams.get('scope')).toBe('today');
  });

  it('switches scope and says so when nothing is there', async () => {
    const api = stubApi({ [`GET ${list}`]: () => json({ data: [] }) });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<TasksView agencyId="a1" />);
    expect(await screen.findByText('Nothing is due today.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Upcoming' }));
    expect(await screen.findByText('Nothing is coming up.')).toBeTruthy();
    expect(api.calls.at(-1)!.url.searchParams.get('scope')).toBe('upcoming');
  });

  it('marks a task done and reloads', async () => {
    const api = stubApi({
      [`GET ${list}`]: () => json({ data: [task('t1')] }),
      [`POST ${list}/t1/complete`]: () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<TasksView agencyId="a1" />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Mark done: Follow-up due: Jane Doe: Staff Engineer',
      }),
    );
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    await waitFor(() =>
      expect(api.calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1),
    );
  });

  it('snoozes until a later time', async () => {
    const api = stubApi({
      [`GET ${list}`]: () => json({ data: [task('t1')] }),
      [`POST ${list}/t1/snooze`]: () => new Response(null, { status: 204 }),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<TasksView agencyId="a1" />);
    await user.selectOptions(
      await screen.findByLabelText('Snooze: Follow-up due: Jane Doe: Staff Engineer'),
      'tomorrow',
    );
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    const until = new Date(
      (api.calls.find((c) => c.method === 'POST')!.body as { until: string }).until,
    );
    expect(until.getTime()).toBeGreaterThan(Date.now());
    expect(until.getUTCHours()).toBe(9);
  });

  it('shows an error state', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${list}`]: () => json({ error: { code: 'x', message: 'x' } }, 500) }).impl,
    );
    renderApp(<TasksView agencyId="a1" />);
    expect((await screen.findByRole('alert')).textContent).toBe('Could not load this. Try again.');
  });
});
