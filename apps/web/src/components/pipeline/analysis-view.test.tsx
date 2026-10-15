// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { AnalysisView } from './analysis-view';

vi.mock('@/lib/realtime/use-channel', () => ({ useChannel: () => undefined }));
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const api = '/api/v1/agencies/a1';

const entry = {
  id: 'e1',
  positionId: 'p1',
  candidateId: 'c1',
  candidateName: 'Alex Kim',
  ownerId: 'u1',
  state: 'screened',
  screeningClass: null,
  manualRank: null,
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
};
const latest = { id: 'an1', entryId: 'e1' };
const crit = (
  key: string,
  level: string,
  score: number | null,
  over: Record<string, unknown> = {},
) => ({
  key,
  level,
  score,
  computedScore: score,
  overridden: false,
  overrideReason: null,
  summary: `${key} summary`,
  evidence: [],
  toConfirm: [],
  ...over,
});
const detail = (over: Record<string, unknown> = {}, analysis: Record<string, unknown> = {}) => ({
  analysis: {
    id: 'an1',
    entryId: 'e1',
    artifactId: 'art',
    versionId: 'v1',
    weights: {},
    overall: 78,
    computedOverall: 78,
    overridden: false,
    overrideReason: null,
    recruiterAssessment: null,
    stale: false,
    createdAt: '2026-10-07T00:00:00.000Z',
    ...analysis,
  },
  explainOnly: false,
  criteria: [
    crit('coreCompetencies', 'strong', 90, {
      evidence: [{ type: 'quote', source: 'profile', excerpt: 'Managed a team of 20' }],
      toConfirm: ['Team size?'],
    }),
    crit('relevantExperience', 'strong', 85, {
      evidence: [{ type: 'inferred', rationale: 'Long tenure' }],
    }),
    crit('industryFunctional', 'partial', 60),
    crit('careerLevel', 'partial', 70),
    crit('locationArrangement', 'gap', 20),
    crit('educationCertification', 'strong', 100),
    crit('compensationOther', 'unknown', 50),
  ],
  requirements: [
    {
      criterionId: 'c1',
      text: '8 years in HR',
      category: 'must_have',
      status: 'met',
      evidence: [{ type: 'quote', source: 'profile', excerpt: 'HR Director since 2019' }],
    },
    {
      criterionId: 'c2',
      text: 'Works at a competitor',
      category: 'disqualifying',
      status: 'not_met',
      evidence: [],
    },
  ],
  strengths: [{ key: 'coreCompetencies', summary: 'Led 20 people' }],
  gaps: [{ key: 'locationArrangement', summary: 'Lives far away', level: 'gap' }],
  toConfirm: [{ key: 'coreCompetencies', text: 'Team size?' }],
  reviewed: false,
  basis: { candidateProfileVersionId: 'cp', successProfileVersionId: 'sp' },
  ...over,
});
const serve = (d: unknown, extra: Record<string, () => Response> = {}, noAnalysis = false) => {
  const stub = stubApi({
    [`GET ${api}/pipeline/e1`]: () => json({ data: entry }),
    [`GET ${api}/pipeline/e1/analysis`]: () => json({ data: noAnalysis ? null : latest }),
    [`GET ${api}/analyses/an1`]: () => json({ data: d }),
    ...extra,
  });
  vi.stubGlobal('fetch', stub.impl);
  return stub;
};
const view = () =>
  renderApp(<AnalysisView agencyId="a1" agencySlug="acme" positionId="p1" entryId="e1" />);

describe('AnalysisView', () => {
  it('shows the overall score, each criterion with its level, score, summary and evidence', async () => {
    serve(detail());
    view();
    expect(await screen.findByRole('heading', { name: 'Alex Kim' })).toBeTruthy();
    expect(await screen.findByText('78')).toBeTruthy();
    expect(screen.getByText(/Core competencies: Strong/)).toBeTruthy();
    expect(screen.getByText('Managed a team of 20')).toBeTruthy();
    expect(screen.getByText('Inferred (no quote): Long tenure')).toBeTruthy();
    expect(screen.getAllByText('Team size?').length).toBeGreaterThan(0);
  });

  it('shows each criterion weight from the weights kept with the analysis', async () => {
    serve(
      detail(
        {},
        {
          weights: {
            coreCompetencies: 50,
            relevantExperience: 10,
            industryFunctional: 10,
            careerLevel: 10,
            locationArrangement: 5,
            educationCertification: 10,
            compensationOther: 5,
          },
        },
      ),
    );
    view();
    expect(await screen.findByText(/Core competencies: Strong.*Weight 50%/)).toBeTruthy();
    expect(screen.getByText(/Location \/ arrangement: Gap.*Weight 5%/)).toBeTruthy();
  });

  it('shows must-haves and deal-breakers in the wording that fits, and says nobody is excluded by them', async () => {
    serve(detail());
    view();
    expect(await screen.findByText(/8 years in HR/)).toBeTruthy();
    expect(screen.getByText('Met')).toBeTruthy();
    expect(screen.getByText('Does not apply')).toBeTruthy();
    expect(screen.getByText('HR Director since 2019')).toBeTruthy();
    expect(screen.getByText(/Nobody is excluded because of it/)).toBeTruthy();
  });

  it('lists strengths, gaps and what to confirm', async () => {
    serve(detail());
    view();
    expect(await screen.findByText('Core competencies: Led 20 people')).toBeTruthy();
    expect(screen.getByText('Location / arrangement: Lives far away')).toBeTruthy();
  });

  it('marks an edited score with its reason and the computed value', async () => {
    serve(
      detail(
        {
          criteria: detail().criteria.map((c) =>
            c.key === 'coreCompetencies'
              ? { ...c, score: 50, overridden: true, overrideReason: 'Less depth' }
              : c,
          ),
        },
        { overall: 60, overridden: true, overrideReason: 'Interview', computedOverall: 78 },
      ),
    );
    view();
    expect(await screen.findByText(/Edited: Interview/)).toBeTruthy();
    expect(screen.getByText(/Computed: 78/)).toBeTruthy();
    expect(screen.getByText('Edited: Less depth')).toBeTruthy();
    expect(screen.getByText('computed 90')).toBeTruthy();
  });

  it('changes a criterion score with a reason', async () => {
    const stub = serve(detail(), {
      [`PATCH ${api}/analyses/an1/overrides`]: () => json({ data: {} }),
    });
    const user = userEvent.setup();
    view();
    await user.click(
      await screen.findByRole('button', { name: 'Change: Score for Core competencies' }),
    );
    const form = screen.getByRole('form', { name: 'Score for Core competencies' });
    const save = within(form).getByRole('button', { name: 'Save change' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    const score = within(form).getByLabelText('New score');
    await user.clear(score);
    await user.type(score, '55');
    await user.type(within(form).getByLabelText('Reason'), 'Interview showed less depth');
    await user.click(save);
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      kind: 'criterion',
      key: 'coreCompetencies',
      score: 55,
      reason: 'Interview showed less depth',
    });
  });

  it('changes the overall score, and removes a change with a reason', async () => {
    const stub = serve(detail({}, { overridden: true, overall: 60, overrideReason: 'Old view' }), {
      [`PATCH ${api}/analyses/an1/overrides`]: () => json({ data: {} }),
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Change: Overall score' }));
    const form = screen.getByRole('form', { name: 'Overall score' });
    await user.type(within(form).getByLabelText('Reason'), 'Back to computed');
    await user.click(within(form).getByRole('button', { name: 'Remove the change' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      kind: 'overall',
      score: null,
      reason: 'Back to computed',
    });
  });

  it('refuses a score outside 0 to 100 before sending', async () => {
    const stub = serve(detail());
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Change: Overall score' }));
    const form = screen.getByRole('form', { name: 'Overall score' });
    const score = within(form).getByLabelText('New score');
    await user.clear(score);
    await user.type(score, '150');
    await user.type(within(form).getByLabelText('Reason'), 'Too much');
    expect(
      (within(form).getByRole('button', { name: 'Save change' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(stub.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('saves the recruiter’s own assessment', async () => {
    const stub = serve(detail(), {
      [`PUT ${api}/analyses/an1/assessment`]: () => json({ data: {} }),
    });
    const user = userEvent.setup();
    view();
    const box = await screen.findByLabelText('Your assessment');
    const save = screen.getByRole('button', { name: 'Save assessment' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.type(box, 'Strong fit; verify pay.');
    await user.click(save);
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'PUT')!.body).toEqual({
      text: 'Strong fit; verify pay.',
    });
    expect(screen.getByText('Write this yourself. AI never fills it in.')).toBeTruthy();
  });

  it('marks the analysis reviewed, and then shows it as reviewed', async () => {
    const stub = serve(detail(), {
      [`POST ${api}/analyses/an1/review`]: () => json({ data: { reviewed: true } }),
    });
    const user = userEvent.setup();
    view();
    expect(await screen.findByText('Not reviewed yet')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
  });

  it('shows a reviewed analysis without the review button, and an out-of-date one with a notice', async () => {
    serve(detail({ reviewed: true }, { stale: true }));
    view();
    expect(await screen.findByText('Reviewed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
    expect(screen.getByText(/Out of date: a profile changed/)).toBeTruthy();
  });

  it('starts a new analysis with one click from the out-of-date notice (T-3-12)', async () => {
    const stub = serve(detail({ reviewed: true }, { stale: true }), {
      [`POST ${api}/pipeline/e1/analysis`]: () =>
        new Response('', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Analyze again now' }));
    await waitFor(() =>
      expect(
        stub.calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/analysis')),
      ).toBe(true),
    );
  });

  it('offers no one-click button when the analysis is up to date', async () => {
    serve(detail({ reviewed: true }, { stale: false }));
    view();
    await screen.findByText('Reviewed');
    expect(screen.queryByRole('button', { name: 'Analyze again now' })).toBeNull();
  });

  it('hides the numbers and the score controls in explain-only mode', async () => {
    serve(
      detail(
        {
          explainOnly: true,
          criteria: detail().criteria.map((c) => ({ ...c, score: null, computedScore: null })),
        },
        { overall: null, computedOverall: null },
      ),
    );
    view();
    expect(await screen.findByText('Explain-only mode: scores are hidden.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Change:/ })).toBeNull();
    expect(screen.getByText(/Core competencies: Strong$/)).toBeTruthy();
  });

  it('offers to analyze when there is no analysis yet', async () => {
    serve(null, {}, true);
    view();
    expect(await screen.findByText('This candidate has not been analyzed yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
  });

  it('shows why a run was refused', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      if (init.method === 'POST' && url.pathname.endsWith('/analysis'))
        return json(
          { error: { code: 'conflict', message: "Confirm the candidate's profile first" } },
          409,
        );
      if (url.pathname.endsWith('/pipeline/e1')) return json({ data: entry });
      if (url.pathname.endsWith('/analysis')) return json({ data: null });
      throw new Error(`unexpected ${url.pathname}`);
    });
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole('button', { name: 'Analyze' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        "Confirm the candidate's profile first",
      ),
    );
  });

  it('links to the candidate page and back to the board', async () => {
    serve(detail());
    view();
    expect(
      (await screen.findByRole('link', { name: 'Open the candidate page' })).getAttribute('href'),
    ).toBe('/a/acme/candidates/c1');
    expect(screen.getByRole('link', { name: 'Back to the candidates' }).getAttribute('href')).toBe(
      '/a/acme/positions/p1/candidates',
    );
  });

  describe('auto start (paste and analyze)', () => {
    const post = (stub: ReturnType<typeof stubApi>) =>
      stub.calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/analysis'));
    const stream = () =>
      new Response('', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

    it('starts the first analysis once on arrival', async () => {
      const stub = serve(detail(), { [`POST ${api}/pipeline/e1/analysis`]: stream }, true);
      renderApp(
        <AnalysisView agencyId="a1" agencySlug="acme" positionId="p1" entryId="e1" autoStart />,
      );
      await waitFor(() => expect(post(stub)).toHaveLength(1));
      await screen.findByRole('heading', { name: 'Alex Kim' });
      expect(post(stub)).toHaveLength(1);
    });

    it('never replaces an existing analysis on its own', async () => {
      const stub = serve(detail(), { [`POST ${api}/pipeline/e1/analysis`]: stream });
      renderApp(
        <AnalysisView agencyId="a1" agencySlug="acme" positionId="p1" entryId="e1" autoStart />,
      );
      await screen.findByText('78');
      expect(post(stub)).toHaveLength(0);
    });

    it('waits for the recruiter to click when not asked to auto start', async () => {
      const stub = serve(detail(), { [`POST ${api}/pipeline/e1/analysis`]: stream }, true);
      view();
      await screen.findByRole('button', { name: 'Analyze' });
      expect(post(stub)).toHaveLength(0);
    });
  });
});
