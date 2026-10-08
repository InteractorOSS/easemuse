// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { AddCandidatePanel } from './add-candidate-panel';
import { BatchProgress } from './batch-progress';
import { ReviewBoard } from './review-board';
import { TransitionControl } from './transition-control';

vi.mock('@/lib/realtime/use-channel', () => ({ useChannel: () => undefined }));
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const api = '/api/v1/agencies/a1';
const pos = `${api}/positions/p1`;

const level = (l: string, score: number | null, overridden = false) => ({
  level: l,
  score,
  overridden,
});
const analysed = (over: Record<string, unknown> = {}) => ({
  id: 'an1',
  overall: 78,
  computedOverall: 78,
  overridden: false,
  criteria: {
    coreCompetencies: level('strong', 90),
    relevantExperience: level('strong', 85),
    industryFunctional: level('partial', 60),
    careerLevel: level('partial', 70),
    locationArrangement: level('gap', 20),
    educationCertification: level('strong', 100),
    compensationOther: level('unknown', 50),
  },
  summary: {
    requirements: {
      mustHave: { met: 1, not_met: 1, unknown: 0 },
      disqualifying: { met: 0, not_met: 1, unknown: 0 },
    },
    strengths: [],
    gaps: [{ key: 'locationArrangement', summary: 'Lives far away', level: 'gap' }],
    toConfirmCount: 1,
  },
  assessmentPreview: 'Strong functional fit',
  hasAssessment: true,
  stale: false,
  reviewed: false,
  analyzedAt: '2026-10-07T00:00:00.000Z',
  ...over,
});
const row = (n: number, over: Record<string, unknown> = {}) => ({
  entryId: `e${n}`,
  candidateId: `c${n}`,
  candidateName: `Person ${n}`,
  state: 'sourced',
  doNotContact: false,
  manualRank: null,
  analysis: null,
  ...over,
});
const dashboard = (rows: unknown[], explainOnly = false) => ({ data: { explainOnly, rows } });

describe('TransitionControl', () => {
  const view = (state: 'sourced' | 'screened' = 'sourced') =>
    renderApp(
      <TransitionControl agencyId="a1" entryId="e1" name="Ann" state={state} onMoved={vi.fn()} />,
    );

  it('offers only the stages allowed from the current one', () => {
    stubApiFor({});
    view('sourced');
    const options = Array.from(
      (screen.getByLabelText('Move Ann') as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(options).toEqual(
      expect.arrayContaining(['Move to', 'Reviewed', 'Screened', 'Withdrawn', 'Closed']),
    );
    expect(options).not.toContain('Submitted');
  });

  it('moves a candidate with the chosen stage', async () => {
    const stub = stubApiFor({ [`POST ${api}/pipeline/e1/transitions`]: () => json({ data: {} }) });
    const user = userEvent.setup();
    view();
    await user.selectOptions(screen.getByLabelText('Move Ann'), 'reviewed');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ to: 'reviewed' });
  });

  it('asks for a reason from the agency list when a candidate drops out', async () => {
    const stub = stubApiFor({
      [`GET ${api}/settings`]: () =>
        json({ data: { rejectionReasons: ['Not enough experience', 'Salary mismatch'] } }),
      [`POST ${api}/pipeline/e1/transitions`]: () => json({ data: {} }),
    });
    const user = userEvent.setup();
    view();
    await user.selectOptions(screen.getByLabelText('Move Ann'), 'withdrawn');
    const go = screen.getByRole('button', { name: 'Move' });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    await user.selectOptions(await screen.findByLabelText('Reason'), 'Salary mismatch');
    await user.click(go);
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({
      to: 'withdrawn',
      reasonCode: 'Salary mismatch',
    });
  });

  it('shows a blocking guard with no way round it', async () => {
    stubApiFor({
      [`POST ${api}/pipeline/e1/transitions`]: () =>
        json(
          {
            error: {
              code: 'guard_failed',
              message: 'x',
              guards: [{ guard: 'consent', mode: 'block', message: 'No consent for this client.' }],
            },
          },
          409,
        ),
    });
    const user = userEvent.setup();
    view('screened');
    await user.selectOptions(screen.getByLabelText('Move Ann'), 'contacting');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByText('No consent for this client.')).toBeTruthy();
    expect(screen.getByText('Resolve this first.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Go ahead anyway' })).toBeNull();
  });

  it('lets a warning be overridden with a reason, sent for that guard', async () => {
    let attempt = 0;
    const stub = stubApiFor({
      [`POST ${api}/pipeline/e1/transitions`]: () =>
        ++attempt === 1
          ? json(
              {
                error: {
                  code: 'guard_failed',
                  message: 'x',
                  guards: [{ guard: 'consent', mode: 'warn', message: 'No consent yet.' }],
                },
              },
              409,
            )
          : json({ data: {} }),
    });
    const user = userEvent.setup();
    view('screened');
    await user.selectOptions(screen.getByLabelText('Move Ann'), 'contacting');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    await user.type(
      await screen.findByLabelText('Reason for going ahead anyway'),
      'Verbal consent on a call',
    );
    await user.click(screen.getByRole('button', { name: 'Go ahead anyway' }));
    await waitFor(() => expect(stub.calls.filter((c) => c.method === 'POST')).toHaveLength(2));
    expect(stub.calls.filter((c) => c.method === 'POST')[1]!.body).toEqual({
      to: 'contacting',
      overrideGuards: [{ guard: 'consent', reason: 'Verbal consent on a call' }],
    });
  });

  it('explains a move the state map refuses', async () => {
    stubApiFor({
      [`POST ${api}/pipeline/e1/transitions`]: () =>
        json({ error: { code: 'invalid_transition', message: 'x' } }, 409),
    });
    const user = userEvent.setup();
    view();
    await user.selectOptions(screen.getByLabelText('Move Ann'), 'reviewed');
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That move is not allowed from this stage.',
    );
  });

  it('has nothing to offer for a finished candidate', () => {
    stubApiFor({});
    renderApp(
      <TransitionControl agencyId="a1" entryId="e1" name="Ann" state="started" onMoved={vi.fn()} />,
    );
    expect(screen.getByText('No further steps')).toBeTruthy();
  });
});

function stubApiFor(routes: Record<string, () => Response>) {
  const stub = stubApi(routes);
  vi.stubGlobal('fetch', stub.impl);
  return stub;
}

describe('AddCandidatePanel', () => {
  it('searches the database and adds a candidate, marking those already in the position', async () => {
    const found = [
      { id: 'c1', fullName: 'Alex Kim', currentTitle: 'HR Director', location: 'Seoul' },
      { id: 'c2', fullName: 'Dana Cho', currentTitle: null, location: null },
    ];
    const stub = stubApiFor({
      [`GET ${api}/candidates`]: () => json({ data: found }),
      [`POST ${pos}/candidates`]: () => json({ data: {} }, 201),
    });
    const onAdded = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <AddCandidatePanel
        agencyId="a1"
        agencySlug="acme"
        positionId="p1"
        inPosition={new Set(['c2'])}
        onAdded={onAdded}
      />,
    );
    await user.type(screen.getByLabelText('Search your candidates'), 'ka');
    expect(await screen.findByText('Already in this position')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Add Alex Kim' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ candidateId: 'c1' });
    expect(screen.getByRole('link', { name: 'Add a new candidate' }).getAttribute('href')).toBe(
      '/a/acme/candidates/new',
    );
  });

  it('waits for two letters and says when nobody is found', async () => {
    const stub = stubApiFor({ [`GET ${api}/candidates`]: () => json({ data: [] }) });
    const user = userEvent.setup();
    renderApp(
      <AddCandidatePanel
        agencyId="a1"
        agencySlug="acme"
        positionId="p1"
        inPosition={new Set()}
        onAdded={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Search your candidates'), 'z');
    expect(stub.calls).toHaveLength(0);
    await user.type(screen.getByLabelText('Search your candidates'), 'z');
    expect(await screen.findByText('No candidate found.')).toBeTruthy();
  });
});

describe('BatchProgress', () => {
  const job = (status: string, progress: unknown) =>
    json({ data: { id: 'j1', status, progress, error: null } });
  const progress = (over: Record<string, unknown>) => ({
    total: 3,
    completed: 1,
    failed: 0,
    skipped: 0,
    entries: {
      e1: { status: 'done', analysisId: 'a' },
      e2: { status: 'running' },
      e3: { status: 'pending' },
    },
    ...over,
  });

  it('shows how far it is and each candidate’s state', async () => {
    stubApiFor({ [`GET ${api}/jobs/j1`]: () => job('running', progress({})) });
    renderApp(
      <BatchProgress
        agencyId="a1"
        jobRunId="j1"
        names={{ e1: 'Ann', e2: 'Ben', e3: 'Cho' }}
        onFinished={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('Analyzing 1 of 3…')).toBeTruthy();
    expect(screen.getByText('Ann: done')).toBeTruthy();
    expect(screen.getByText('Ben: working')).toBeTruthy();
    expect(screen.getByText('Cho: waiting')).toBeTruthy();
    expect((screen.getByRole('progressbar') as HTMLProgressElement).value).toBe(1);
  });

  it('reports the result when finished, with the reason for a skipped candidate, and can be closed', async () => {
    const onFinished = vi.fn();
    const onClose = vi.fn();
    stubApiFor({
      [`GET ${api}/jobs/j1`]: () =>
        job(
          'succeeded',
          progress({
            completed: 1,
            failed: 1,
            skipped: 1,
            entries: {
              e1: { status: 'done' },
              e2: { status: 'failed', reason: 'conflict' },
              e3: { status: 'skipped', reason: 'budget_exceeded' },
            },
          }),
        ),
    });
    const user = userEvent.setup();
    renderApp(
      <BatchProgress
        agencyId="a1"
        jobRunId="j1"
        names={{ e1: 'Ann', e2: 'Ben', e3: 'Cho' }}
        onFinished={onFinished}
        onClose={onClose}
      />,
    );
    expect(await screen.findByText('Done: 1 analyzed, 1 failed, 1 skipped.')).toBeTruthy();
    expect(screen.getByText('Ben: failed (profile not confirmed)')).toBeTruthy();
    expect(screen.getByText('Cho: skipped (AI budget used)')).toBeTruthy();
    expect(onFinished).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ReviewBoard', () => {
  const serve = (
    rows: unknown[],
    explainOnly = false,
    extra: Record<string, () => Response> = {},
  ) =>
    stubApiFor({
      [`GET ${pos}/review`]: () => json(dashboard(rows, explainOnly)),
      [`GET ${pos}`]: () => json({ data: { ownerId: 'u1' } }),
      ...extra,
    });
  const board = (role: 'admin' | 'lead' | 'recruiter' = 'recruiter', userId = 'u1') =>
    renderApp(
      <ReviewBoard agencyId="a1" agencySlug="acme" positionId="p1" viewer={{ userId, role }} />,
    );
  const names = () => screen.getAllByRole('rowheader').map((h) => h.textContent);

  it('lists candidates in the suggested order with the dashboard columns', async () => {
    serve([row(1, { analysis: analysed() }), row(2)]);
    board();
    expect(await screen.findByRole('link', { name: 'Person 1' })).toBeTruthy();
    expect(names()).toEqual(['Person 1', 'Person 2']);
    const first = screen.getAllByRole('row')[1]!;
    expect(within(first).getByText('78')).toBeTruthy();
    expect(within(first).getByText('Strong 90')).toBeTruthy();
    expect(within(first).getByText('Gap 20')).toBeTruthy();
    expect(within(first).getByText('1 met, 1 not met, 0 unknown')).toBeTruthy();
    expect(within(first).getByText('Lives far away')).toBeTruthy();
    expect(within(first).getByText('Strong functional fit')).toBeTruthy();
    expect(within(first).getByText('Not reviewed yet')).toBeTruthy();
    expect(screen.getByText('Not analyzed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Person 1' }).getAttribute('href')).toBe(
      '/a/acme/positions/p1/candidates/e1',
    );
  });

  it('marks an edited score, an out-of-date analysis, a reviewed one and a deal-breaker', async () => {
    serve([
      row(1, {
        analysis: analysed({
          overridden: true,
          overall: 60,
          stale: true,
          reviewed: true,
          criteria: { ...analysed().criteria, coreCompetencies: level('strong', 50, true) },
          summary: {
            ...analysed().summary,
            requirements: {
              mustHave: { met: 2, not_met: 0, unknown: 0 },
              disqualifying: { met: 1, not_met: 0, unknown: 0 },
            },
          },
        }),
      }),
    ]);
    board();
    const first = (await screen.findAllByRole('row'))[1]!;
    expect(within(first).getAllByTitle('Edited by the recruiter').length).toBeGreaterThanOrEqual(2);
    expect(within(first).getByText('Out of date')).toBeTruthy();
    // "Reviewed" is also a stage in the move list; the badge is the span.
    expect(
      within(first)
        .getAllByText('Reviewed')
        .some((el) => el.tagName === 'SPAN'),
    ).toBe(true);
    expect(within(first).getByText('Deal-breaker applies')).toBeTruthy();
  });

  it('hides the numbers in explain-only mode', async () => {
    serve(
      [
        row(1, {
          analysis: analysed({
            overall: null,
            computedOverall: null,
            criteria: Object.fromEntries(
              Object.entries(analysed().criteria).map(([k, v]) => [k, { ...v, score: null }]),
            ),
          }),
        }),
      ],
      true,
    );
    board();
    expect(await screen.findByText(/Explain-only mode/)).toBeTruthy();
    const first = screen.getAllByRole('row')[1]!;
    expect(within(first).getAllByText('Strong').length).toBeGreaterThan(0);
    expect(first.textContent).not.toMatch(/\b(78|90|85|60)\b/);
  });

  it('filters by status and by must-haves not met, and sorts by name', async () => {
    serve([
      row(2, { state: 'screened', analysis: analysed() }),
      row(1, {
        state: 'sourced',
        analysis: analysed({
          summary: {
            ...analysed().summary,
            requirements: {
              mustHave: { met: 1, not_met: 0, unknown: 0 },
              disqualifying: { met: 0, not_met: 0, unknown: 0 },
            },
          },
        }),
      }),
    ]);
    const user = userEvent.setup();
    board();
    await screen.findByRole('link', { name: 'Person 1' });
    await user.selectOptions(screen.getByLabelText('Sort by'), 'name');
    expect(names()).toEqual(['Person 1', 'Person 2']);
    await user.selectOptions(screen.getByLabelText('Status'), 'screened');
    expect(names()).toEqual(['Person 2']);
    await user.selectOptions(screen.getByLabelText('Status'), '');
    await user.click(screen.getByLabelText('Only candidates with a must-have not met'));
    expect(names()).toEqual(['Person 2']);
  });

  it('saves a new order when a candidate is moved, for the position owner', async () => {
    const stub = serve([row(1), row(2), row(3)], false, {
      [`PUT ${pos}/review-order`]: () => new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    board('recruiter', 'u1');
    await user.click(await screen.findByRole('button', { name: 'Move Person 3 up' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'PUT')!.body).toEqual({
      entryIds: ['e1', 'e3', 'e2'],
    });
  });

  it('offers no reordering to a recruiter who does not own the position', async () => {
    serve([row(1), row(2)]);
    board('recruiter', 'someone-else');
    await screen.findByRole('link', { name: 'Person 1' });
    expect(screen.queryByRole('button', { name: /Move Person 2 up/ })).toBeNull();
  });

  it('analyzes the selected candidates in the background and shows the progress', async () => {
    const stub = serve([row(1), row(2), row(3)], false, {
      [`POST ${pos}/analyses`]: () => json({ data: { jobRunId: 'j1', total: 2 } }, 202),
      [`GET ${api}/jobs/j1`]: () =>
        json({
          data: {
            id: 'j1',
            status: 'running',
            progress: {
              total: 2,
              completed: 0,
              failed: 0,
              skipped: 0,
              entries: { e1: { status: 'running' }, e3: { status: 'pending' } },
            },
            error: null,
          },
        }),
    });
    const user = userEvent.setup();
    board();
    await screen.findByRole('link', { name: 'Person 1' });
    const analyze = screen.getByRole('button', { name: /Analyze selected/ });
    expect((analyze as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByLabelText('Open Person 1'));
    await user.click(screen.getByLabelText('Open Person 3'));
    expect(screen.getByRole('button', { name: 'Analyze selected (2)' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Analyze selected (2)' }));
    expect(await screen.findByText('Analyzing 0 of 2…')).toBeTruthy();
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ entryIds: ['e1', 'e3'] });
  });

  it('analyzes every out-of-date candidate again with one click, or just one (T-3-12)', async () => {
    const stub = serve(
      [
        row(1, { analysis: analysed({ stale: true }) }),
        row(2, { analysis: analysed({ stale: false }) }),
        row(3, { analysis: analysed({ stale: true }) }),
      ],
      false,
      {
        [`POST ${pos}/analyses`]: () => json({ data: { jobRunId: 'j1', total: 2 } }, 202),
        [`GET ${api}/jobs/j1`]: () =>
          json({
            data: {
              id: 'j1',
              status: 'running',
              progress: { total: 2, completed: 0, failed: 0, skipped: 0, entries: {} },
              error: null,
            },
          }),
      },
    );
    const user = userEvent.setup();
    board();
    await user.click(await screen.findByRole('button', { name: 'Analyze out-of-date again (2)' }));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ entryIds: ['e1', 'e3'] }),
    );
    await user.click(await screen.findByRole('button', { name: 'Analyze Person 3 again' }));
    await waitFor(() =>
      expect(stub.calls.filter((c) => c.method === 'POST').at(-1)!.body).toEqual({
        entryIds: ['e3'],
      }),
    );
  });

  it('offers no re-analysis to a recruiter who does not own the position', async () => {
    serve([row(1, { analysis: analysed({ stale: true }) })]);
    board('recruiter', 'someone-else');
    await screen.findByText('Out of date');
    expect(screen.queryByRole('button', { name: /Analyze out-of-date again/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /again$/ })).toBeNull();
  });

  it('says why an analysis could not start', async () => {
    serve([row(1)], false, {
      [`POST ${pos}/analyses`]: () => json({ error: { code: 'forbidden', message: 'x' } }, 403),
    });
    const user = userEvent.setup();
    board();
    await user.click(await screen.findByLabelText('Open Person 1'));
    await user.click(screen.getByRole('button', { name: 'Analyze selected (1)' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not start the analysis',
    );
  });

  it('says so when nobody has been added yet', async () => {
    serve([]);
    board();
    expect(await screen.findByText(/No candidates yet/)).toBeTruthy();
  });
});
