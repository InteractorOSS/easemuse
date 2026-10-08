// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPatternReports, summaryFacts, summaryContent, type EntryFact } from '@easemuse/core';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { ClientHistoryView } from './client-history-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const api = '/api/v1/agencies/a1';
const P = '00000000-0000-4000-9000-000000000001';
const C = '00000000-0000-4000-a000-000000000001';
const guid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const fact = (n: number, over: Partial<EntryFact> = {}): EntryFact => ({
  entryId: guid(n),
  positionId: P,
  clientId: C,
  seniority: 'Director',
  yearsExperience: 9,
  skills: ['Payroll'],
  source: 'referral',
  submitted: true,
  interviewed: n % 2 === 0,
  offered: false,
  hired: n === 2,
  contacted: true,
  responded: true,
  decision: n % 2 === 0 ? 'advanced' : 'declined',
  exit: n % 2 === 0 ? null : { stage: 'submitted', reasonCode: 'Compensation' },
  feedback: { technicalFit: { strong: 1 } },
  criteria: null,
  ...over,
});
const entries = Array.from({ length: 7 }, (_, i) => fact(i + 1));
const positions = [
  { positionId: P, title: 'Head of HR', clientId: C, workArrangement: 'hybrid', statesPay: true },
];
const reports = buildPatternReports(entries, positions);

const history = {
  client: { id: C, name: 'Acme' },
  currentPositionId: P,
  asOf: '2026-10-07',
  totals: { positions: 1, submitted: 7, interviewed: 3, hired: 1 },
  positions: [
    {
      id: P,
      title: 'Head of HR',
      status: 'interviewing',
      openings: 1,
      createdAt: '2026-09-01T00:00:00Z',
      isCurrent: true,
      submitted: 7,
      interviewed: 3,
      hired: 1,
    },
  ],
  candidates: [
    {
      entryId: guid(2),
      positionId: P,
      positionTitle: 'Head of HR',
      candidateName: 'Dana Cho',
      state: 'started',
      outcome: 'hired',
      seniority: 'Director',
      submittedAt: '2026-09-02T00:00:00Z',
      rounds: [{ roundName: 'Panel', status: 'completed', scheduledAt: null }],
      ratings: { technicalFit: { strong: 2 } },
      reasonCode: null,
    },
    {
      entryId: guid(3),
      positionId: P,
      positionTitle: 'Head of HR',
      candidateName: 'Hal Moon',
      state: 'client_rejected',
      outcome: 'declined_after_submission',
      seniority: 'Manager',
      submittedAt: '2026-09-03T00:00:00Z',
      rounds: [],
      ratings: {},
      reasonCode: 'Compensation',
    },
  ],
  feedback: [
    { criterion: 'technicalFit', strong: 2, moderate: 0, gap: 1, total: 3, small: true },
    { criterion: 'leadershipFit', strong: 0, moderate: 0, gap: 0, total: 0, small: true },
    { criterion: 'communication', strong: 0, moderate: 0, gap: 0, total: 0, small: true },
    { criterion: 'culturalFit', strong: 0, moderate: 0, gap: 0, total: 0, small: true },
    { criterion: 'industryExperience', strong: 0, moderate: 0, gap: 0, total: 0, small: true },
  ],
  declineReasons: [{ code: 'Compensation', count: 3, small: true }],
  withheldReasons: 1,
};

const facts = summaryFacts(reports);
const draft = summaryContent(
  {
    statements: [
      {
        text: `${facts[0]!.hits} of ${facts[0]!.n} candidates put forward were invited to interview.`,
        factIds: [facts[0]!.id],
      },
    ],
  },
  facts,
  { clientId: C, clientName: 'Acme', asOf: '2026-10-07', records: 7, positions: 1, withheld: 0 },
);

function routes(extra: Record<string, () => Response> = {}) {
  return {
    [`GET ${api}/positions/${P}/client-history`]: () => json(history),
    [`GET ${api}/positions/${P}/patterns`]: () =>
      json({ scope: 'client', client: { id: C, name: 'Acme' }, asOf: '2026-10-07', reports }),
    [`GET ${api}/positions/${P}/pattern-summary`]: () =>
      json({ artifactId: null, approvedVersionId: null }),
    ...extra,
  };
}

describe('client history, patterns and the AI summary', () => {
  it('shows the history with counts, outcomes and a search that finds records again', async () => {
    vi.stubGlobal('fetch', stubApi(routes()).impl);
    const user = userEvent.setup();
    const { container } = renderApp(
      <ClientHistoryView agencyId="a1" agencySlug="acme" positionId={P} />,
    );
    expect(
      await screen.findByRole('heading', { name: 'What has this client liked before?' }),
    ).toBeTruthy();
    expect(screen.getByText(/own records for Acme/)).toBeTruthy();
    const dana = screen.getByRole('link', { name: 'Dana Cho' });
    expect(dana.getAttribute('href')).toBe(`/a/acme/positions/${P}/candidates/${guid(2)}`);
    expect(screen.getAllByText('Hired').length).toBeGreaterThan(1); // the total and the outcome
    expect(screen.getByText('Reason given: Compensation')).toBeTruthy();
    expect(
      screen.getByText(/1 value was left out because it names a protected characteristic/),
    ).toBeTruthy();
    // few ratings are flagged
    expect(screen.getAllByText('Few records').length).toBeGreaterThan(0);

    await user.type(screen.getByRole('searchbox', { name: 'Search this history' }), 'compens');
    expect(screen.queryByRole('link', { name: 'Dana Cho' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Hal Moon' })).toBeTruthy();
    await user.clear(screen.getByRole('searchbox', { name: 'Search this history' }));
    await expectNoA11yViolations(container);
  });

  it('answers the seven questions, each number with its record count and links', async () => {
    vi.stubGlobal('fetch', stubApi(routes()).impl);
    const user = userEvent.setup();
    const { container } = renderApp(
      <ClientHistoryView agencyId="a1" agencySlug="acme" positionId={P} />,
    );
    await user.click(await screen.findByRole('tab', { name: 'Patterns' }));
    for (const title of [
      'Which candidate profiles lead to an interview?',
      'Which candidate profiles lead to a hire?',
      'Which sources bring quality candidates?',
      'Which job descriptions get a high response?',
      'Where do candidates drop out?',
      'What do the hiring managers actually prefer?',
      'Which job-related characteristics go with the people hired?',
    ]) {
      expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    }
    expect(screen.getByText(/7 candidates in 1 position/)).toBeTruthy();
    const q1 = screen.getByRole('region', {
      name: 'Which candidate profiles lead to an interview?',
    });
    expect(within(q1).getAllByText(/3 of 7 \(43%\)/).length).toBeGreaterThan(0);
    expect(within(q1).getAllByText(/Show the records \(7\)/).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('asks for the AI summary only when the recruiter presses the button', async () => {
    const stub = stubApi(
      routes({
        [`POST ${api}/positions/${P}/pattern-summary`]: () => new Response(null, { status: 500 }),
      }),
    );
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<ClientHistoryView agencyId="a1" agencySlug="acme" positionId={P} />);
    await user.click(await screen.findByRole('tab', { name: 'AI summary' }));
    expect(await screen.findByText('No summary has been written yet.')).toBeTruthy();
    expect(stub.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows the draft with the records behind every sentence, and it passes axe', async () => {
    const version = {
      id: 'v1',
      version: 1,
      status: 'draft',
      origin: 'ai',
      content: draft,
      factCheck: null,
      aiGenerationId: null,
      parentVersionId: null,
      createdAt: '2026-10-07T00:00:00Z',
      approvedAt: null,
    };
    vi.stubGlobal(
      'fetch',
      stubApi(
        routes({
          [`GET ${api}/positions/${P}/pattern-summary`]: () =>
            json({ artifactId: 'art1', approvedVersionId: null }),
          [`GET ${api}/artifacts/art1`]: () =>
            json({
              id: 'art1',
              kind: 'pattern_summary',
              subject: { type: 'position', id: P },
              approvedVersionId: null,
              versions: [version],
            }),
        }),
      ).impl,
    );
    const user = userEvent.setup();
    const { container } = renderApp(
      <ClientHistoryView agencyId="a1" agencySlug="acme" positionId={P} />,
    );
    await user.click(await screen.findByRole('tab', { name: 'AI summary' }));
    const sentence = await screen.findByRole('textbox', { name: 'Sentence 1' });
    expect((sentence as HTMLTextAreaElement).value).toBe(draft.statements[0]!.text);
    expect(screen.getAllByText('AI draft').length).toBeGreaterThan(0);
    expect(screen.getByText('Based on')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Record \d/ })[0]!.getAttribute('href')).toContain(
      `/a/acme/positions/${P}/candidates/`,
    );
    expect(screen.getByText('Every sentence passed the check.')).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
