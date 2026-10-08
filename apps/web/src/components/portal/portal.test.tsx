// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { ConsentView } from './consent-view';
import { EnterView } from './enter-view';
import { PrivacyView } from './privacy-view';
import { ShareList } from './share-list';
import { ShareView } from './share-view';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const api = '/api/portal/v1/acme';
const GUID = '11111111-1111-4111-8111-111111111111';

const sections = [
  'position_summary',
  'key_responsibilities',
  'required_qualifications',
  'preferred_qualifications',
  'core_competencies',
  'technical_skills',
  'industry_experience',
  'leadership_management',
  'years_of_experience',
  'education_certification',
  'location',
  'compensation',
  'work_authorization',
].map((key, i) => ({
  key,
  status: i === 11 ? 'missing' : 'found',
  summary: i === 11 ? '' : `About ${key}`,
}));
const jd = {
  id: 's1',
  kind: 'jd_for_approval',
  updatedOn: null,
  snapshot: {
    kind: 'jd_for_approval',
    positionTitle: 'Head of HR',
    clientName: 'Acme',
    versionId: GUID,
    sections,
    requirements: [{ text: '10 years of HR', category: 'must_have' }],
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
  updatedOn: '2026-10-08T00:00:00Z',
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
const resume = {
  id: 's3',
  kind: 'tailored_resume',
  updatedOn: null,
  snapshot: {
    kind: 'tailored_resume',
    positionTitle: 'Head of HR',
    clientName: 'Acme',
    versionId: GUID,
    publishedAt: '2026-10-07T00:00:00Z',
    resume: {
      blind: false,
      header: { name: null, email: null, phone: null, location: null },
      headline: 'HR Director',
      summary: 'HR leader',
      roles: [
        {
          company: 'Northwind',
          title: 'HR Director',
          start: '2019',
          end: null,
          current: true,
          original: '',
          bullets: ['Led 20'],
        },
      ],
      education: [{ school: 'SNU', degree: 'BA', year: '2012' }],
      skills: ['Payroll'],
    },
  },
};

describe('opening a portal from the link', () => {
  it('trades the token in the address for a session and removes it from the address bar', async () => {
    window.history.replaceState(null, '', '/h/acme/enter#token=abc123abc123abc123abc123');
    const assign = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      replace: assign,
      hash: '#token=abc123abc123abc123abc123',
      pathname: '/h/acme/enter',
    });
    const stub = stubApi({
      'POST /api/public/portal/acme/redeem': () => json({ audience: 'hiring_manager' }),
    });
    vi.stubGlobal('fetch', stub.impl);
    renderApp(<EnterView slug="acme" prefix="h" audience="hiring_manager" />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/h/acme'));
    expect(stub.calls[0]!.body).toEqual({ token: 'abc123abc123abc123abc123' });
  });

  it('offers a new link when the old one is used up, and says the same whoever asks', async () => {
    vi.stubGlobal('location', {
      ...window.location,
      replace: vi.fn(),
      hash: '#token=abc123abc123abc123abc123',
      pathname: '/h/acme/enter',
    });
    const stub = stubApi({
      'POST /api/public/portal/acme/redeem': () => json({}, 409),
      'POST /api/public/portal/acme/relogin': () => json({ sent: true }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(<EnterView slug="acme" prefix="h" audience="hiring_manager" />);
    expect((await screen.findByRole('alert')).textContent).toContain('expired');
    await userEvent.type(screen.getByLabelText('Email'), 'park@client.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send me a new link' }));
    expect((await screen.findByRole('status')).textContent).toContain('If that email has access');
    expect(stub.calls.at(-1)!.body).toEqual({
      email: 'park@client.test',
      audience: 'hiring_manager',
    });
    await expectNoA11yViolations(container);
  });
});

describe('the list and the shares', () => {
  it('lists what was shared', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/shares`]: () =>
          json([
            {
              id: 's1',
              kind: 'jd_for_approval',
              title: 'Head of HR',
              subtitle: 'Acme',
              publishedAt: '2026-10-07T00:00:00Z',
            },
          ]),
      }).impl,
    );
    const { container } = renderApp(<ShareList slug="acme" prefix="h" audience="hiring_manager" />);
    expect((await screen.findByRole('link', { name: /Head of HR/ })).getAttribute('href')).toBe(
      '/h/acme/s/s1',
    );
    await expectNoA11yViolations(container);
  });

  it('shows the JD with its missing sections, and approving sends the comment', async () => {
    const stub = stubApi({
      [`GET ${api}/shares/s1`]: () => json(jd),
      [`POST ${api}/shares/s1/approve`]: () => json({ id: 'a1' }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(<ShareView slug="acme" prefix="h" shareId="s1" />);
    expect(await screen.findByRole('heading', { name: 'Head of HR' })).toBeTruthy();
    expect(screen.getByText(/Not in the description/)).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.type(screen.getByLabelText('Comments (optional)'), 'Looks right');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect((await screen.findAllByText(/approval is recorded/)).length).toBeGreaterThan(0);
    expect(stub.calls.at(-1)).toMatchObject({ method: 'POST', body: { comments: 'Looks right' } });
  });

  it('tells the person when the JD changed while they read it', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/shares/s1`]: () => json(jd),
        [`POST ${api}/shares/s1/approve`]: () =>
          Response.json({ error: { code: 'stale_share', message: 'x' } }, { status: 409 }),
      }).impl,
    );
    renderApp(<ShareView slug="acme" prefix="h" shareId="s1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/updated while you were reading/)).toBeTruthy();
  });

  it('a submission shows the 14 sections, the documents and "updated on", and a decision is only sent as a proposal', async () => {
    const stub = stubApi({
      [`GET ${api}/shares/s2`]: () => json(submission),
      [`POST ${api}/shares/s2/decision`]: () => json({ id: 'p1' }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(<ShareView slug="acme" prefix="h" shareId="s2" />);
    expect(await screen.findByRole('heading', { name: 'Alex Kim' })).toBeTruthy();
    expect(screen.getByText(/Updated on/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Download the report/ }).getAttribute('href')).toBe(
      `${api}/files/s2/${GUID}`,
    );
    expect(screen.getByRole('heading', { name: "14. Recruiter's assessment" })).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Send decision' }));
    expect((await screen.findAllByText(/recruiter will confirm/)).length).toBeGreaterThan(0);
    expect(stub.calls.at(-1)!.body).toEqual({ decision: 'interview' });
  });

  it('a candidate sees their own resume and can ask for changes', async () => {
    const stub = stubApi({
      [`GET ${api}/shares/s3`]: () => json(resume),
      [`POST ${api}/shares/s3/request-changes`]: () => json({ id: 'a2' }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(<ShareView slug="acme" prefix="c" shareId="s3" />);
    expect(await screen.findByText('Led 20')).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    expect((await screen.findAllByText(/comments were sent/)).length).toBeGreaterThan(0);
  });

  it('a candidate sees where their applications stand, only as much as the level allows', async () => {
    const status = (level: 'basic' | 'detailed') => ({
      id: 's4',
      kind: 'status',
      updatedOn: null,
      snapshot: {
        kind: 'status',
        level,
        applications: [
          {
            positionTitle: 'Head of HR',
            clientName: level === 'detailed' ? 'Acme' : null,
            step: 'interviewing',
            since: level === 'detailed' ? '2026-10-01' : null,
            interviews: level === 'detailed' ? 2 : null,
          },
        ],
        publishedAt: '2026-10-07T00:00:00Z',
      },
    });
    vi.stubGlobal('fetch', stubApi({ [`GET ${api}/shares/s4`]: () => json(status('basic')) }).impl);
    const basic = renderApp(<ShareView slug="acme" prefix="c" shareId="s4" />);
    expect(await screen.findByText('Interviewing')).toBeTruthy();
    expect(screen.getByText('Head of HR')).toBeTruthy();
    expect(screen.queryByText('Employer')).toBeNull();
    await expectNoA11yViolations(basic.container);
    basic.unmount();

    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${api}/shares/s4`]: () => json(status('detailed')) }).impl,
    );
    const detailed = renderApp(<ShareView slug="acme" prefix="c" shareId="s4" />);
    expect(await screen.findByText('Acme')).toBeTruthy();
    expect(screen.getByText('Employer')).toBeTruthy();
    await expectNoA11yViolations(detailed.container);
  });

  it('a withdrawn share shows a calm error with a way back', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/shares/s9`]: () =>
          Response.json({ error: { code: 'not_found', message: 'x' } }, { status: 404 }),
      }).impl,
    );
    renderApp(<ShareView slug="acme" prefix="h" shareId="s9" />);
    expect((await screen.findByRole('alert')).textContent).toContain('withdrawn');
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/h/acme');
  });
});

describe("the candidate's own screens", () => {
  it('consent: give, then withdraw', async () => {
    let current: string | null = null;
    const stub = stubApi({
      [`GET ${api}/consents`]: () =>
        json([
          {
            clientId: GUID,
            clientName: 'Acme',
            current,
            since: current ? '2026-10-07T00:00:00Z' : null,
          },
        ]),
      [`POST ${api}/consents`]: (_u, init) => {
        current = JSON.parse(String(init.body)).action;
        return json({ recorded: true }, 201);
      },
    });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(<ConsentView slug="acme" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Give consent' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw consent' }));
    await waitFor(() =>
      expect(
        stub.calls
          .filter((c) => c.method === 'POST')
          .map((c) => (c.body as { action: string }).action),
      ).toEqual(['given', 'withdrawn']),
    );
    await expectNoA11yViolations(container);
  });

  it('privacy: sends the request, and says so when one is already open', async () => {
    const stub = stubApi({ [`POST ${api}/privacy-requests`]: () => json({ id: 'r1' }, 201) });
    vi.stubGlobal('fetch', stub.impl);
    const { container } = renderApp(<PrivacyView slug="acme" />);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect((await screen.findByRole('status')).textContent).toContain('45 days');
    expect(stub.calls[0]!.body).toEqual({ kind: 'export' });
  });
});
