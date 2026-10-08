// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { PortalSharing } from './portal-sharing';
import { ProposalsPanel } from './proposals-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const api = '/api/v1/agencies/a1';
const noop = () => undefined;
const person = (over: Record<string, unknown> = {}) => ({
  personId: 'k1',
  name: 'Ms. Park',
  title: 'VP',
  hasEmail: true,
  portalUser: null,
  ...over,
});

describe('sharing through the portal', () => {
  it('invites a contact, then shares with them, and the screen passes axe', async () => {
    let invited = false;
    const stub = stubApi({
      [`GET ${api}/portal-users`]: () =>
        json([person(invited ? { portalUser: { id: 'pu1', disabled: false } } : {})]),
      [`GET ${api}/portal-shares`]: () => json([]),
      [`POST ${api}/portal-users`]: () => {
        invited = true;
        return json({ portalUserId: 'pu1' }, 201);
      },
      [`POST ${api}/portal-shares`]: () => json({ id: 'sh1' }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(
      <PortalSharing
        agencyId="a1"
        target={{ positionId: 'p1' }}
        subject={{ kind: 'jd_for_approval', subjectId: 'p1' }}
        heading="Send to the hiring manager for approval"
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({
      audience: 'hiring_manager',
      clientContactId: 'k1',
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(stub.calls.filter((c) => c.method === 'POST').at(-1)!.body).toEqual({
      kind: 'jd_for_approval',
      subjectId: 'p1',
      portalUserId: 'pu1',
    });
    await expectNoA11yViolations(container);
  });

  it('cannot invite someone without an email, and a shared item can be withdrawn', async () => {
    const stub = stubApi({
      [`GET ${api}/portal-users`]: () =>
        json([
          person({ personId: 'k1', name: 'No Mail', hasEmail: false }),
          person({ personId: 'k2', name: 'Mr. Lee', portalUser: { id: 'pu2', disabled: false } }),
        ]),
      [`GET ${api}/portal-shares`]: () =>
        json([
          {
            id: 'sh9',
            kind: 'submission',
            portalUserId: 'pu2',
            subjectId: 'e1',
            createdAt: '2026-10-07T00:00:00Z',
            revokedAt: null,
          },
        ]),
      [`DELETE ${api}/portal-shares/sh9`]: () => json({ revoked: true }),
    });
    vi.stubGlobal('fetch', stub.impl);
    renderApp(
      <PortalSharing
        agencyId="a1"
        target={{ entryId: 'e1' }}
        subject={{ kind: 'submission', subjectId: 'e1' }}
        heading="Share"
      />,
    );
    const invite = await screen.findByRole('button', { name: 'Invite' });
    expect((invite as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Share again' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(stub.calls.some((c) => c.method === 'DELETE')).toBe(true);
  });
});

describe('the hiring manager proposals', () => {
  it("shows only this candidate's proposals; accepting a rejection needs a reason code", async () => {
    const proposal = (id: string, entryId: string, toState: string) => ({
      id,
      entryId,
      candidateName: 'Alex',
      positionTitle: 'HR',
      toState,
      reason: 'Not senior enough',
      proposedBy: 'Ms. Park',
      createdAt: '2026-10-07T00:00:00Z',
    });
    const stub = stubApi({
      [`GET ${api}/proposed-transitions`]: () =>
        json([proposal('pr1', 'e1', 'client_rejected'), proposal('pr2', 'other', 'interviewing')]),
      [`GET ${api}/settings`]: () => json({ rejectionReasons: ['Not a fit', 'Pay'] }),
      [`POST ${api}/proposed-transitions/pr1/resolve`]: () => json({ resolved: true }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(<ProposalsPanel agencyId="a1" entryId="e1" onChanged={noop} />);
    expect(await screen.findByText(/Ms. Park proposes: reject/)).toBeTruthy();
    expect(screen.queryByText(/proposes: interview/)).toBeNull();
    await expectNoA11yViolations(container);
    await userEvent.selectOptions(await screen.findByLabelText('Reason for the rejection'), 'Pay');
    await userEvent.click(screen.getByRole('button', { name: 'Accept and move' }));
    expect(stub.calls.filter((c) => c.method === 'POST').at(-1)!.body).toEqual({
      accept: true,
      reasonCode: 'Pay',
    });
  });
});
