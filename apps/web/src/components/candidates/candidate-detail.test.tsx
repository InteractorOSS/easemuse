// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { CandidateDetail } from './candidate-detail';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const api = '/api/v1/agencies/a1';
const candidate = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  fullName: 'Alex Kim',
  email: 'alex@x.com',
  phone: null,
  profileUrl: 'https://www.linkedin.com/in/alex',
  source: 'linkedin',
  status: 'active',
  currentTitle: 'HR Director',
  location: 'Seoul',
  skills: ['payroll'],
  yearsExperience: 12,
  doNotContact: false,
  doNotContactReason: null,
  doNotContactAt: null,
  tags: ['vip'],
  createdAt: '2026-10-07T00:00:00.000Z',
  profileArtifactId: null,
  approvedProfileVersionId: null,
  positions: [
    {
      entryId: 'e1',
      positionId: 'p1',
      title: 'Head of HR',
      clientName: 'Northwind',
      state: 'screened',
    },
  ],
  documents: [
    {
      id: 'd1',
      fileId: 'f1',
      filename: 'cv.pdf',
      kind: 'resume',
      extractionStatus: 'ready',
      extractionError: null,
      parsedFromImage: false,
      createdAt: '2026-10-05T00:00:00.000Z',
    },
  ],
  ...over,
});
const serve = (c: Record<string, unknown>, extra: Record<string, () => Response> = {}) => {
  const stub = stubApi({
    [`GET ${api}/candidates/c1`]: () => json({ data: c }),
    [`GET ${api}/activity`]: () => json({ data: [], nextCursor: null }),
    ...extra,
  });
  vi.stubGlobal('fetch', stub.impl);
  return stub;
};
const view = (role: 'admin' | 'lead' | 'recruiter' = 'recruiter') =>
  renderApp(<CandidateDetail agencyId="a1" agencySlug="acme" candidateId="c1" viewerRole={role} />);

describe('CandidateDetail', () => {
  it('shows the summary, contact details, positions and original files', async () => {
    serve(candidate());
    view();
    expect(await screen.findByRole('heading', { name: 'Alex Kim' })).toBeTruthy();
    expect(screen.getByText('HR Director · Seoul')).toBeTruthy();
    expect(screen.getByText(/12 years of experience/)).toBeTruthy();
    expect(screen.getByText('Email').nextElementSibling?.textContent).toBe('alex@x.com');
    expect(screen.getByText('Phone').nextElementSibling?.textContent).toBe('Not stated');
    expect(screen.getByRole('link', { name: 'Head of HR' }).getAttribute('href')).toBe(
      '/a/acme/positions/p1',
    );
    expect(screen.getByText('cv.pdf')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download original' }).getAttribute('href')).toBe(
      `${api}/files/f1`,
    );
  });

  it('says so when there is no position, no profile and no file', async () => {
    serve(candidate({ positions: [], documents: [] }));
    view();
    expect(await screen.findByText('Not in any position yet.')).toBeTruthy();
    expect(screen.getByText('No profile yet.')).toBeTruthy();
    expect(screen.getByText('No files.')).toBeTruthy();
  });

  it('points a draft to its review', async () => {
    serve(candidate({ status: 'draft' }));
    view();
    expect(
      (await screen.findByRole('link', { name: 'Open the review' })).getAttribute('href'),
    ).toBe('/a/acme/candidates/c1/review');
    expect(screen.queryByRole('heading', { name: 'Do not contact' })).toBeNull();
  });

  it('marks a candidate as do not contact with a reason', async () => {
    const stub = serve(candidate(), {
      [`PATCH ${api}/candidates/c1/do-not-contact`]: () =>
        json({ data: { doNotContact: true, reason: 'x', at: null } }),
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Mark as do not contact' }));
    const form = screen.getByRole('form', { name: 'Mark as do not contact' });
    const submit = within(form).getByRole('button', { name: 'Mark as do not contact' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(form).getByLabelText('Reason'), 'Asked us to stop');
    await user.click(submit);
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      value: true,
      reason: 'Asked us to stop',
    });
  });

  it('shows the flag with its reason, and lets only an admin clear it', async () => {
    serve(
      candidate({
        doNotContact: true,
        doNotContactReason: 'Asked us to stop',
        doNotContactAt: '2026-10-01T00:00:00.000Z',
      }),
    );
    const { unmount } = view('recruiter');
    expect(await screen.findByText(/Marked on .*: Asked us to stop/)).toBeTruthy();
    expect(screen.getAllByText('Do not contact').length).toBeGreaterThan(0);
    expect(screen.getByText('Only an admin can clear this.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear do-not-contact' })).toBeNull();
    unmount();
    view('admin');
    expect(await screen.findByRole('button', { name: 'Clear do-not-contact' })).toBeTruthy();
  });

  it('explains when the server refuses', async () => {
    serve(candidate(), {
      [`PATCH ${api}/candidates/c1/do-not-contact`]: () =>
        json({ error: { code: 'conflict', message: 'x' } }, 409),
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Mark as do not contact' }));
    await user.type(screen.getByLabelText('Reason'), 'Asked us to stop');
    await user.click(
      within(screen.getByRole('form', { name: 'Mark as do not contact' })).getByRole('button', {
        name: 'Mark as do not contact',
      }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe('Confirm the candidate first.');
  });
});
