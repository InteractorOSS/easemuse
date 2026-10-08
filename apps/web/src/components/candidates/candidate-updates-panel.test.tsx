// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { CandidateUpdatesPanel } from './candidate-updates-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const base = '/api/v1/agencies/a1/candidates/c1/profile-updates';
const update = {
  id: 'u1',
  changes: { phone: '010-1111-2222', availability: 'From 1 December' },
  createdAt: '2026-10-07T00:00:00Z',
};

describe('what the candidate says changed (FR-CDP-04)', () => {
  it('lists only the fields that changed and does nothing until the recruiter answers; passes axe', async () => {
    const stub = stubApi({ [`GET ${base}`]: () => json([update]) });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(<CandidateUpdatesPanel agencyId="a1" candidateId="c1" />);
    expect(await screen.findByText('010-1111-2222')).toBeTruthy();
    expect(screen.getByText('From 1 December')).toBeTruthy();
    expect(screen.queryByText('Email')).toBeNull();
    expect(stub.calls.some((c) => c.method === 'POST')).toBe(false);
    await expectNoA11yViolations(container);
  });

  it('accepts or declines', async () => {
    const stub = stubApi({
      [`GET ${base}`]: () => json([update]),
      [`POST ${base}/u1/resolve`]: () => json({ resolved: true }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<CandidateUpdatesPanel agencyId="a1" candidateId="c1" />);
    await user.click(await screen.findByRole('button', { name: 'Accept into the profile' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ accept: true });
  });

  it('renders nothing when there is nothing to answer', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${base}`]: () => json([]) }).impl);
    const { container } = renderApp(<CandidateUpdatesPanel agencyId="a1" candidateId="c1" />);
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });
});
