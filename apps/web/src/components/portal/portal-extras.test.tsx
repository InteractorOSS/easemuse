// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTAKE_TOPICS } from '@easemuse/core';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { DetailsView } from './details-view';
import { ShareView } from './share-view';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const api = '/api/portal/v1/acme';
const GUID = '11111111-1111-4111-8111-111111111111';

const intake = {
  id: 's4',
  kind: 'intake_form',
  updatedOn: null,
  snapshot: {
    kind: 'intake_form',
    positionTitle: 'Head of HR',
    clientName: 'Acme',
    topics: INTAKE_TOPICS.map((key) => ({
      key,
      questions: key === 'business_reason' ? ['Why is this role open?'] : [],
    })),
    publishedAt: '2026-10-07T00:00:00Z',
  },
};

const reportKeys = [
  'overview',
  'currentPosition',
  'careerSummary',
  'keyQualifications',
  'achievements',
  'jdMatch',
  'recommendation',
  'concerns',
  'compensation',
  'location',
  'workAuthorization',
  'motivation',
  'interviewAvailability',
  'recruiterAssessment',
];
const submission = {
  id: 's2',
  kind: 'submission',
  updatedOn: null,
  snapshot: {
    kind: 'submission',
    candidateName: 'Alex Kim',
    positionTitle: 'Head of HR',
    clientName: 'Acme',
    report: Object.fromEntries(reportKeys.map((k) => [k, `Text ${k}`])),
    reportFile: { fileId: GUID, filename: 'report.pdf' },
    resumeFile: { fileId: GUID, filename: 'resume.pdf' },
    reportVersionId: GUID,
    resumeVersionId: GUID,
    submittedAt: '2026-10-07T00:00:00Z',
    publishedAt: '2026-10-07T00:00:00Z',
  },
};

describe('the hiring manager answers the intake questionnaire (FR-HMP-03)', () => {
  it('shows the ten topics with the recruiters questions and sends only what was answered', async () => {
    const stub = stubApi({
      [`GET ${api}/shares/s4`]: () => json(intake),
      [`POST ${api}/shares/s4/intake-answers`]: () => json({ topics: ['business_reason'] }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const { container } = renderApp(<ShareView slug="acme" prefix="h" shareId="s4" />);
    expect(await screen.findByRole('heading', { name: 'Questions about Head of HR' })).toBeTruthy();
    expect(screen.getByText('Why is this role open?')).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(11); // ten topics and the stages box
    await expectNoA11yViolations(container);
    await user.type(
      screen.getByLabelText('Why this person is needed (business reason)'),
      'Growth of the Seoul team',
    );
    await user.click(screen.getByRole('button', { name: 'Send my answers' }));
    expect((await screen.findByRole('status')).textContent).toContain('sent to the recruiter');
    expect(stub.calls.at(-1)!.body).toEqual({
      answers: { business_reason: { value: 'Growth of the Seoul team' } },
    });
  });

  it('asks for at least one answer before sending anything', async () => {
    const stub = stubApi({ [`GET ${api}/shares/s4`]: () => json(intake) });
    vi.stubGlobal('fetch', stub.impl);
    renderApp(<ShareView slug="acme" prefix="h" shareId="s4" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send my answers' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Answer at least one topic.');
    expect(stub.calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('the hiring manager offers interview times (FR-HMP-06)', () => {
  it('sends up to five times as dates, with the optional round, and says the recruiter confirms', async () => {
    const stub = stubApi({
      [`GET ${api}/shares/s2`]: () => json(submission),
      [`POST ${api}/shares/s2/slots`]: () => json({ id: 'sp1' }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const { container } = renderApp(<ShareView slug="acme" prefix="h" shareId="s2" />);
    await screen.findByRole('group', { name: 'Offer interview times' });
    expect(screen.getByRole('button', { name: 'Send these times' }).hasAttribute('disabled')).toBe(
      true,
    );
    await expectNoA11yViolations(container);
    fireEvent.change(screen.getByLabelText('Time 1'), { target: { value: '2030-11-03T10:00' } });
    await user.click(screen.getByRole('button', { name: 'Add a time' }));
    fireEvent.change(screen.getByLabelText('Time 2'), { target: { value: '2030-11-04T14:30' } });
    await user.type(screen.getByLabelText('Round name (optional)'), 'Panel interview');
    await user.click(screen.getByRole('button', { name: 'Send these times' }));
    expect((await screen.findAllByText(/recruiter will confirm one/)).length).toBeGreaterThan(0);
    const body = stub.calls.at(-1)!.body as { slots: string[]; roundName: string };
    expect(body.roundName).toBe('Panel interview');
    expect(body.slots).toEqual([
      new Date('2030-11-03T10:00').toISOString(),
      new Date('2030-11-04T14:30').toISOString(),
    ]);
  });

  it('stops adding at five times', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${api}/shares/s2`]: () => json(submission) }).impl);
    const user = userEvent.setup();
    renderApp(<ShareView slug="acme" prefix="h" shareId="s2" />);
    await screen.findByRole('group', { name: 'Offer interview times' });
    for (let i = 0; i < 6; i++) {
      const add = screen.queryByRole('button', { name: 'Add a time' });
      if (add) await user.click(add);
    }
    expect(screen.getAllByLabelText(/^Time \d$/)).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Add a time' })).toBeNull();
  });

  it('says so when times are already waiting', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/shares/s2`]: () => json(submission),
        [`POST ${api}/shares/s2/slots`]: () =>
          Response.json(
            { error: { code: 'conflict', message: 'Times are already waiting for the recruiter' } },
            { status: 409 },
          ),
      }).impl,
    );
    renderApp(<ShareView slug="acme" prefix="h" shareId="s2" />);
    await screen.findByRole('group', { name: 'Offer interview times' });
    fireEvent.change(screen.getByLabelText('Time 1'), { target: { value: '2030-11-03T10:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Send these times' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Times are already waiting for the recruiter.',
    );
  });
});

describe('the candidate updates their details (FR-CDP-04)', () => {
  const mine = [
    {
      id: 'u1',
      changes: { phone: '010-1111-2222' },
      status: 'waiting',
      createdAt: '2026-10-07T00:00:00Z',
    },
    {
      id: 'u0',
      changes: { availability: 'Now' },
      status: 'accepted',
      createdAt: '2026-10-01T00:00:00Z',
    },
  ];

  it('sends only the fields that were filled in, says nothing changes until the recruiter accepts, and passes axe', async () => {
    const stub = stubApi({
      [`GET ${api}/profile-updates`]: () => json(mine),
      [`POST ${api}/profile-updates`]: () => json({ id: 'u2' }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const { container } = renderApp(<DetailsView slug="acme" />);
    expect(await screen.findByText('Waiting for your recruiter')).toBeTruthy();
    expect(screen.getByText('Accepted')).toBeTruthy();
    expect(screen.getByText(/nothing changes until they do/)).toBeTruthy();
    await expectNoA11yViolations(container);
    await user.type(screen.getByLabelText('Phone'), '010-9999-0000');
    await user.type(screen.getByLabelText('Compensation you expect'), 'KRW 150M');
    await user.click(screen.getByRole('button', { name: 'Send to my recruiter' }));
    expect((await screen.findByRole('status')).textContent).toContain('Your recruiter will review');
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({
      phone: '010-9999-0000',
      compensationExpectation: 'KRW 150M',
    });
  });

  it('does not send an empty form', async () => {
    const stub = stubApi({ [`GET ${api}/profile-updates`]: () => json([]) });
    vi.stubGlobal('fetch', stub.impl);
    renderApp(<DetailsView slug="acme" />);
    expect(await screen.findByText('You have not sent anything yet.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Send to my recruiter' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Change at least one thing.');
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(false));
  });
});
