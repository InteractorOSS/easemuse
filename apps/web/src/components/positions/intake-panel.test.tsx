// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { IntakePanel } from './intake-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const path = '/api/v1/agencies/a1/positions/p1';
const view = (over: Record<string, unknown> = {}) => ({
  data: { answers: {}, jdApproval: null, ...over },
});

describe('IntakePanel', () => {
  it('shows the ten topics of the brief and saves only what was filled in', async () => {
    const stub = stubApi({
      [`GET ${path}/intake`]: () => json(view()),
      [`PUT ${path}/intake`]: () => json(view()),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit />);
    await user.type(
      await screen.findByLabelText('Why this person is needed (business reason)'),
      'Replace a leaver',
    );
    await user.type(
      screen.getByLabelText('Interview stages, one per line'),
      'Screen{enter}Technical{enter}Panel',
    );
    await user.click(screen.getByRole('button', { name: 'Save intake' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'PUT')!.body).toEqual({
      answers: {
        business_reason: { value: 'Replace a leaver' },
        interview_process: { value: '', stages: ['Screen', 'Technical', 'Panel'] },
      },
    });
  });

  it('starts from the saved answers', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}/intake`]: () =>
          json(
            view({
              answers: {
                expected_timeline: { value: 'By March', source: 'recruiter', status: 'accepted' },
              },
            }),
          ),
      }).impl,
    );
    renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit />);
    expect(
      ((await screen.findByLabelText('Expected hiring timeline')) as HTMLTextAreaElement).value,
    ).toBe('By March');
  });

  it('records the hiring manager decision and shows the latest one', async () => {
    const stub = stubApi({
      [`GET ${path}/intake`]: () => json(view()),
      [`POST ${path}/jd-approval`]: () => json({ data: {} }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit />);
    expect(await screen.findByText('No decision recorded yet.')).toBeTruthy();
    const form = screen.getByRole('form', { name: 'Hiring manager decision on the JD' });
    const submit = within(form).getByRole('button', { name: 'Record decision' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(form).getByLabelText('Hiring manager name'), 'Hana Choi');
    await user.selectOptions(within(form).getByLabelText('How they told you'), 'phone');
    await user.click(submit);
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      decision: 'approved',
      approverName: 'Hana Choi',
      method: 'phone',
    });
  });

  it('warns when the decision is for an older version of the JD', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}/intake`]: () =>
          json(
            view({
              jdApproval: {
                id: 'a',
                decision: 'approved',
                approverName: 'Hana Choi',
                method: 'email',
                decidedAt: '2026-10-01T00:00:00.000Z',
                comments: null,
                source: 'recorded_by_recruiter',
                versionId: 'v1',
                current: false,
              },
            }),
          ),
      }).impl,
    );
    renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit />);
    expect(await screen.findByText(/Approved by Hana Choi/)).toBeTruthy();
    expect(screen.getByText(/The JD changed after this decision/)).toBeTruthy();
  });

  it('tells the user to approve the JD first when the server refuses', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}/intake`]: () => json(view()),
        [`POST ${path}/jd-approval`]: () =>
          json({ error: { code: 'conflict', message: 'x' } }, 409),
      }).impl,
    );
    const user = userEvent.setup();
    renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit />);
    const form = await screen.findByRole('form', { name: 'Hiring manager decision on the JD' });
    await user.type(within(form).getByLabelText('Hiring manager name'), 'Hana Choi');
    await user.click(within(form).getByRole('button', { name: 'Record decision' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Approve the structured JD first.');
  });

  it('is read-only for someone who cannot edit', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${path}/intake`]: () => json(view()) }).impl);
    renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit={false} />);
    expect(
      ((await screen.findByLabelText('Expected hiring timeline')) as HTMLTextAreaElement).readOnly,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save intake' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record decision' })).toBeNull();
  });

  describe('answers from the hiring manager (FR-HMP-03)', () => {
    const withProposal = () =>
      view({
        answers: {
          business_reason: { value: 'Backfill', source: 'recruiter', status: 'accepted' },
        },
        proposals: [
          {
            topic: 'business_reason',
            value: 'Growth of the Seoul team',
            proposedBy: 'Ms. Park',
            at: '2026-10-07T00:00:00Z',
          },
          {
            topic: 'interview_process',
            value: 'Two rounds',
            stages: ['Phone', 'Panel'],
            proposedBy: 'Ms. Park',
            at: '2026-10-07T00:00:00Z',
          },
        ],
      });

    it('shows them beside the recruiter answer, changes nothing, and passes axe', async () => {
      const stub = stubApi({ [`GET ${path}/intake`]: () => json(withProposal()) });
      vi.stubGlobal('fetch', stub.impl);
      const { container } = renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit />);
      const section = await screen.findByRole('region', {
        name: 'Answers from the hiring manager',
      });
      expect(within(section).getByText('Growth of the Seoul team')).toBeTruthy();
      expect(within(section).getByText('Your answer now: Backfill')).toBeTruthy();
      expect(within(section).getByText('You have no answer for this topic yet.')).toBeTruthy();
      expect(within(section).getByText('Phone')).toBeTruthy();
      expect(stub.calls.some((c) => c.method !== 'GET')).toBe(false);
      // the recruiter's own field is untouched
      expect(
        (screen.getByLabelText(/Why this person is needed/) as HTMLTextAreaElement).value,
      ).toBe('Backfill');
      await expectNoA11yViolations(container);
    });

    it('accepts one answer and declines another, each with its own request', async () => {
      const stub = stubApi({
        [`GET ${path}/intake`]: () => json(withProposal()),
        [`POST ${path}/intake/proposals`]: () => json(view()),
      });
      vi.stubGlobal('fetch', stub.impl);
      const user = userEvent.setup();
      renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit />);
      await user.click(
        await screen.findByRole('button', {
          name: 'Accept and replace mine: Why this person is needed (business reason)',
        }),
      );
      await user.click(screen.getByRole('button', { name: 'Decline: Interview process' }));
      await waitFor(() => expect(stub.calls.filter((c) => c.method === 'POST')).toHaveLength(2));
      expect(stub.calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
        { topic: 'business_reason', accept: true },
        { topic: 'interview_process', accept: false },
      ]);
    });

    it('cannot be answered by someone who cannot edit', async () => {
      vi.stubGlobal('fetch', stubApi({ [`GET ${path}/intake`]: () => json(withProposal()) }).impl);
      renderApp(<IntakePanel agencyId="a1" positionId="p1" canEdit={false} />);
      await screen.findByRole('region', { name: 'Answers from the hiring manager' });
      expect(screen.queryByRole('button', { name: /^Decline/ })).toBeNull();
    });
  });
});
