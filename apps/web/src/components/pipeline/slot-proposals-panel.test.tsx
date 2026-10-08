// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { SlotProposalsPanel } from './slot-proposals-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const api = '/api/v1/agencies/a1';
const proposal = (over: Record<string, unknown> = {}) => ({
  id: 'sp1',
  entryId: 'e1',
  positionId: 'p1',
  candidateName: 'Alex Kim',
  positionTitle: 'Head of HR',
  roundName: 'Panel interview',
  format: 'video',
  slots: ['2026-11-03T05:00:00.000Z', '2026-11-04T06:30:00.000Z'],
  note: 'Mornings are best',
  proposedBy: 'Ms. Park',
  createdAt: '2026-10-07T00:00:00Z',
  ...over,
});

describe('interview times offered by the hiring manager (FR-HMP-06)', () => {
  it('shows the offered times for this candidate only, and passes axe', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/interview-slot-proposals`]: () =>
          json([proposal(), proposal({ id: 'sp2', entryId: 'other', roundName: 'Elsewhere' })]),
      }).impl,
    );
    const { container } = renderApp(
      <SlotProposalsPanel agencyId="a1" entryId="e1" onChanged={() => undefined} />,
    );
    expect(await screen.findByText('Ms. Park offered times for Panel interview')).toBeTruthy();
    expect(screen.queryByText(/Elsewhere/)).toBeNull();
    expect(screen.getByText('Note: Mornings are best')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('confirms the chosen time with the interviewers; nothing happens before that', async () => {
    const stub = stubApi({
      [`GET ${api}/interview-slot-proposals`]: () => json([proposal()]),
      [`POST ${api}/interview-slot-proposals/sp1/resolve`]: () => json({ interviewId: 'iv1' }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const onChanged = vi.fn();
    renderApp(<SlotProposalsPanel agencyId="a1" entryId="e1" onChanged={onChanged} />);
    await screen.findByText(/offered times/);
    expect(stub.calls.some((c) => c.method === 'POST')).toBe(false);
    await user.click(screen.getAllByRole('radio')[1]!);
    await user.type(
      screen.getByLabelText('Interviewers, separated by commas'),
      'Ms. Park, Mr. Lee',
    );
    await user.click(screen.getByRole('button', { name: 'Confirm this time' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({
      decision: 'confirm',
      slotIndex: 1,
      interviewers: ['Ms. Park', 'Mr. Lee'],
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('declines all the times', async () => {
    const stub = stubApi({
      [`GET ${api}/interview-slot-proposals`]: () => json([proposal()]),
      [`POST ${api}/interview-slot-proposals/sp1/resolve`]: () => json({ interviewId: null }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<SlotProposalsPanel agencyId="a1" entryId="e1" onChanged={() => undefined} />);
    await user.click(await screen.findByRole('button', { name: 'Decline all times' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ decision: 'decline' });
  });

  it('renders nothing when no times are waiting', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${api}/interview-slot-proposals`]: () => json([]) }).impl,
    );
    const { container } = renderApp(
      <SlotProposalsPanel agencyId="a1" entryId="e1" onChanged={() => undefined} />,
    );
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });
});
