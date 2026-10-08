// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortfolioPanel } from '@/components/candidates/portfolio-panel';
import { SettingsView } from '@/components/admin/settings-view';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { removeBenchmarkItem } from './benchmark-editor';
import { BenchmarkPage } from './benchmark-view';
import { PoolMatchesViewPage } from './pool-matches-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

describe('Find in my pool', () => {
  const base = '/api/v1/agencies/a1/positions/p1';
  const person = (n: number, over: Record<string, unknown> = {}) => ({
    candidate: {
      id: `c${n}`,
      fullName: `Person ${n}`,
      currentTitle: 'HR Director',
      location: 'Seoul',
      skills: ['payroll'],
      yearsExperience: 12,
      doNotContact: false,
      ...over,
    },
    similarity: 0.82,
    reason: `Led HR at a similar company ${n}`,
    caveat: n === 1 ? 'Check the team size' : null,
  });
  const view = (items: unknown[] = [person(1), person(2, { doNotContact: true })]) => ({
    artifactId: 'art1',
    versionId: 'v1',
    versionStatus: 'draft',
    generatedOn: '2026-10-07',
    basis: 'semantic',
    items,
    poolSize: 40,
    notIndexed: 3,
    alreadyInPosition: 2,
  });

  it('shows suggestions with a reason each, says what was searched, marks do-not-contact, and has no accessibility violations', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${base}/pool-matches`]: () => json({ data: view() }) }).impl,
    );
    const { container } = renderApp(
      <PoolMatchesViewPage agencyId="a1" agencySlug="acme" positionId="p1" />,
    );
    expect(await screen.findByRole('link', { name: 'Person 1' })).toBeTruthy();
    expect(screen.getByText('Led HR at a similar company 1')).toBeTruthy();
    expect(screen.getByText('To check: Check the team size')).toBeTruthy();
    expect(screen.getByText(/3 are not indexed yet and were not compared/)).toBeTruthy();
    expect(screen.getByText(/2 candidates are already in this position/)).toBeTruthy();
    expect(screen.getByText('Do not contact')).toBeTruthy();
    // The figure is labelled as a reference and the list as a suggestion, not a ranking.
    expect(screen.getAllByText('Reference similarity: 0.82')).toHaveLength(2);
    expect(screen.getByText(/not a ranking of who is better/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Person 1' }).getAttribute('href')).toBe(
      '/a/acme/candidates/c1',
    );
    await expectNoA11yViolations(container);
  });

  it('runs the search only when asked, and adds a candidate only when asked', async () => {
    const stub = stubApi({
      [`GET ${base}/pool-matches`]: () =>
        json({ data: { ...view([]), artifactId: null, generatedOn: null, basis: null } }),
      [`POST ${base}/pool-matches`]: () => json({ data: view() }),
      [`POST ${base}/candidates`]: () => json({ data: { entryId: 'e1' } }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<PoolMatchesViewPage agencyId="a1" agencySlug="acme" positionId="p1" />);
    await screen.findByRole('button', { name: 'Find in my pool' });
    expect(stub.calls.some((c) => c.method === 'POST')).toBe(false); // nothing runs on its own
    await user.click(screen.getByRole('button', { name: 'Find in my pool' }));
    await screen.findByRole('link', { name: 'Person 1' });
    expect(
      stub.calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/candidates')),
    ).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Add Person 1 to this position' }));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.url.pathname === `${base}/candidates`)?.body).toEqual({
        candidateId: 'c1',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Add Person 1 to this position' }),
    ).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Add Person 2 to this position' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('explains a refusal: the success profile is not confirmed', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${base}/pool-matches`]: () => json({ data: { ...view([]), artifactId: null } }),
        [`POST ${base}/pool-matches`]: () =>
          error('conflict', 'Confirm the success profile first', 409),
      }).impl,
    );
    const user = userEvent.setup();
    renderApp(<PoolMatchesViewPage agencyId="a1" agencySlug="acme" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Find in my pool' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Confirm the success profile first',
    );
  });
});

describe('Check open positions', () => {
  const url = '/api/v1/agencies/a1/candidates/c1/portfolio';
  const view = {
    artifactId: 'art1',
    versionId: 'v1',
    versionStatus: 'draft',
    generatedOn: '2026-10-07',
    truncated: false,
    items: [
      {
        position: {
          id: 'p3',
          title: 'Recruiter',
          location: 'Busan',
          clientName: 'Globex',
          status: 'sourcing',
        },
        fit: 'low',
        reason: 'No recruiting work',
      },
      {
        position: {
          id: 'p1',
          title: 'HR Director',
          location: 'Seoul',
          clientName: 'Acme',
          status: 'sourcing',
        },
        fit: 'strong',
        reason: 'Same role',
      },
      {
        position: {
          id: 'p2',
          title: 'HRBP',
          location: 'Seoul',
          clientName: 'Acme',
          status: 'intake',
        },
        fit: 'moderate',
        reason: 'Adjacent',
      },
    ],
    notAssessed: [
      {
        position: { id: 'p4', title: 'Draft role', clientName: 'Acme' },
        why: 'no_success_profile',
      },
      {
        position: { id: 'p5', title: 'Already in', clientName: 'Acme' },
        why: 'already_in_pipeline',
      },
    ],
  };

  it('lists strong, moderate then low, keeps the low fits, and names what was not assessed', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${url}`]: () => json({ data: view }) }).impl);
    const { container } = renderApp(
      <PortfolioPanel agencyId="a1" agencySlug="acme" candidateId="c1" />,
    );
    await screen.findByRole('link', { name: 'HR Director' });
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    const fits = items
      .filter((t) => /fit:/.test(t))
      .map((t) => /(Strong|Moderate|Low) fit/.exec(t)![1]);
    expect(fits).toEqual(['Strong', 'Moderate', 'Low']);
    expect(screen.getByText('Not assessed')).toBeTruthy();
    expect(screen.getByText(/No confirmed success profile yet/)).toBeTruthy();
    expect(screen.getByText(/Already in this position/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'HR Director' }).getAttribute('href')).toBe(
      '/a/acme/positions/p1',
    );
    await expectNoA11yViolations(container);
  });

  it('checks only when asked and shows the result', async () => {
    const stub = stubApi({
      [`GET ${url}`]: () =>
        json({
          data: { ...view, artifactId: null, items: [], notAssessed: [], generatedOn: null },
        }),
      [`POST ${url}`]: () => json({ data: view }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<PortfolioPanel agencyId="a1" agencySlug="acme" candidateId="c1" />);
    await user.click(await screen.findByRole('button', { name: 'Check open positions' }));
    expect(await screen.findByRole('link', { name: 'HR Director' })).toBeTruthy();
    expect(stub.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});

describe('Market benchmark', () => {
  const base = '/api/v1/agencies/a1/positions/p1/benchmark';
  const PAST = '11111111-1111-4111-8111-111111111111';
  const content = {
    generatedOn: '2026-10-07',
    webSearch: 'done',
    webSearchesUsed: 2,
    ourData: [
      {
        id: 'O1',
        category: 'skill',
        text: 'Go was a required skill in 2 of 2 similar past positions.',
        positionIds: [PAST],
      },
    ],
    web: [
      {
        id: 'W1',
        category: 'compensation',
        text: 'Typical pay is USD 130k to 160k.',
        sources: [
          {
            url: 'https://www.jobs.example.com/be',
            title: 'Backend job',
            retrievedOn: '2026-10-07',
            publishedAt: 'May 2026',
          },
        ],
      },
    ],
    suggestions: [
      {
        id: 'G1',
        kind: 'add_requirement',
        section: 'technical_skills',
        text: 'Kubernetes experience',
        category: 'preferred',
        requirementId: null,
        rationale: 'Common in postings',
        basedOn: ['W1'],
      },
      {
        id: 'G2',
        kind: 'change_requirement',
        section: 'technical_skills',
        text: 'Go 1.22+',
        category: 'must_have',
        requirementId: 'r1',
        rationale: 'Our past roles',
        basedOn: ['O1'],
      },
    ],
    droppedWebItems: 2,
  };
  const view = (
    status: 'draft' | 'approved',
    decisions: Record<string, string> = {},
    over: Record<string, unknown> = {},
  ) => ({
    artifactId: 'art1',
    versionId: 'v1',
    versionStatus: status,
    content,
    decisions,
    ourPositions: { [PAST]: { title: 'Senior Backend Engineer', status: 'filled' } },
    hasStructuredJd: true,
    requirementTexts: { r1: 'Go' },
    webSearchEnabled: true,
    ...over,
  });
  const artifact = (status: 'draft' | 'approved') => ({
    id: 'art1',
    kind: 'benchmark_report',
    subject: { type: 'position', id: 'p1' },
    approvedVersionId: status === 'approved' ? 'v1' : null,
    versions: [
      {
        id: 'v1',
        version: 1,
        status,
        origin: 'ai',
        content,
        factCheck: null,
        aiGenerationId: null,
        parentVersionId: null,
        createdAt: '2026-10-07T09:00:00Z',
        approvedAt: null,
      },
    ],
  });
  const routes = (status: 'draft' | 'approved', decisions = {}, over = {}) => ({
    [`GET ${base}`]: () => json({ data: view(status, decisions, over) }),
    'GET /api/v1/agencies/a1/artifacts/art1': () => json({ data: artifact(status) }),
  });

  it('keeps "Our data" and "Web" apart, shows link, read date and page date on every web item, and has no accessibility violations', async () => {
    vi.stubGlobal('fetch', stubApi(routes('draft')).impl);
    const { container } = renderApp(
      <BenchmarkPage agencyId="a1" agencySlug="acme" positionId="p1" />,
    );
    const ours = await screen.findByRole('region', { name: 'Our data' });
    const web = screen.getByRole('region', { name: 'Web' });
    expect(within(ours).getByText(/Go was a required skill/)).toBeTruthy();
    expect(within(ours).queryByText(/Typical pay/)).toBeNull();
    expect(within(web).getByText('Typical pay is USD 130k to 160k.')).toBeTruthy();
    expect(
      within(ours).getByRole('link', { name: 'Senior Backend Engineer' }).getAttribute('href'),
    ).toBe(`/a/acme/positions/${PAST}`);
    const source = within(web).getByRole('link', { name: 'Backend job' });
    expect(source.getAttribute('href')).toBe('https://www.jobs.example.com/be');
    expect(source.getAttribute('rel')).toContain('noopener');
    expect(web.textContent).toContain('read on Oct 7, 2026');
    expect(web.textContent).toContain('page date: May 2026');
    expect(web.textContent).toContain(
      '2 web findings were left out because no cited page backs them.',
    );
    await expectNoA11yViolations(container);
  });

  it('shows suggestions but not the buttons until the report is approved', async () => {
    vi.stubGlobal('fetch', stubApi(routes('draft')).impl);
    renderApp(<BenchmarkPage agencyId="a1" agencySlug="acme" positionId="p1" />);
    await screen.findByText('Kubernetes experience');
    expect(screen.getByText('Approve the report above to accept or reject these.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Accept:/ })).toBeNull();
    expect(screen.getByText('Replaces: Go')).toBeTruthy();
    expect(screen.getByText('Based on: W1')).toBeTruthy();
  });

  it('accepts or rejects one suggestion at a time once approved', async () => {
    const decide = vi.fn(async (_url: URL, init: RequestInit) =>
      json({ data: { decision: JSON.parse(String(init.body)).decision, appliedVersionId: 'jd2' } }),
    );
    const stub = stubApi({
      ...routes('approved'),
      [`POST ${base}/suggestions/G1`]: decide,
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const { container } = renderApp(
      <BenchmarkPage agencyId="a1" agencySlug="acme" positionId="p1" />,
    );
    await user.click(await screen.findByRole('button', { name: 'Accept: Kubernetes experience' }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(stub.calls.find((c) => c.url.pathname.endsWith('/G1'))?.body).toEqual({
      versionId: 'v1',
      decision: 'accepted',
    });
    // The other suggestion is untouched.
    expect(screen.getByRole('button', { name: 'Reject: Go 1.22+' })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('shows decisions already made, without buttons, and blocks accepting when there is no structured JD', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi(routes('approved', { G1: 'accepted' }, { hasStructuredJd: false })).impl,
    );
    renderApp(<BenchmarkPage agencyId="a1" agencySlug="acme" positionId="p1" />);
    await screen.findByText('Kubernetes experience');
    expect(screen.queryByRole('button', { name: 'Accept: Kubernetes experience' })).toBeNull();
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0);
    expect(screen.getByText(/Structure the job description first/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept: Go 1.22+' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('says plainly when web search is off', async () => {
    vi.stubGlobal('fetch', stubApi(routes('draft', {}, { webSearchEnabled: false })).impl);
    renderApp(<BenchmarkPage agencyId="a1" agencySlug="acme" positionId="p1" />);
    expect(await screen.findByText(/Web search is not switched on on this server/)).toBeTruthy();
  });
});

describe('Admin settings: keys', () => {
  const status = (configured: boolean, source: string) => ({
    data: {
      configured,
      source,
      last4: configured ? 'abcd' : null,
      updatedAt: null,
      unreadable: false,
    },
  });

  it('has a section for the Anthropic key and one for the Voyage key, each labelled, with no accessibility violations', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/admin/v1/settings/anthropic': () => json(status(true, 'admin')),
        'GET /api/admin/v1/settings/voyage': () => json(status(false, 'none')),
      }).impl,
    );
    const { container } = renderApp(<SettingsView canWrite />);
    expect(await screen.findByRole('heading', { name: 'Voyage AI API key' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Anthropic API key' })).toBeTruthy();
    expect(screen.getByText(/No key is set. Pool search falls back to keywords/)).toBeTruthy();
    expect(screen.getByText(/A key is in use \(entered here\), ending in abcd/)).toBeTruthy();
    expect(screen.getByLabelText('Voyage AI API key: New API key')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('warns when real AI calls are failing because the account has no credit', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/admin/v1/settings/anthropic': () =>
          json({
            data: {
              ...status(true, 'environment').data,
              problem: {
                code: 'no_credit',
                firstAt: '2026-10-08T06:00:00.000Z',
                lastAt: '2026-10-08T06:09:40.000Z',
                count: 3,
              },
            },
          }),
        'GET /api/admin/v1/settings/voyage': () => json(status(false, 'none')),
      }).impl,
    );
    const { container } = renderApp(<SettingsView canWrite />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/the Anthropic account has run out of credit/);
    expect(alert.textContent).toMatch(/3 failed calls/);
    await expectNoA11yViolations(container);
  });

  it('saves the Voyage key to its own endpoint and tests it there', async () => {
    const stub = stubApi({
      'GET /api/admin/v1/settings/anthropic': () => json(status(true, 'environment')),
      'GET /api/admin/v1/settings/voyage': () => json(status(true, 'environment')),
      'PUT /api/admin/v1/settings/voyage': () => json(status(true, 'admin')),
      'POST /api/admin/v1/settings/voyage/test': () =>
        json({ data: { ok: false, message: 'invalid_key' } }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<SettingsView canWrite />);
    await user.type(
      await screen.findByLabelText('Voyage AI API key: New API key'),
      'pa-abcdefghijklmnopqrstuvwxyz',
    );
    await user.click(screen.getByRole('button', { name: 'Save key: Voyage AI API key' }));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.method === 'PUT')?.body).toEqual({
        apiKey: 'pa-abcdefghijklmnopqrstuvwxyz',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Test the key: Voyage AI API key' }));
    expect(await screen.findByText('Voyage AI did not accept this key.')).toBeTruthy();
  });
});

describe('taking an item out of the report', () => {
  const G = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const report = {
    generatedOn: '2026-10-07',
    webSearch: 'done' as const,
    webSearchesUsed: 1,
    ourData: [{ id: 'O1', category: 'skill' as const, text: 'a', positionIds: [G(1)] }],
    web: [
      {
        id: 'W1',
        category: 'skill' as const,
        text: 'b',
        sources: [
          {
            url: 'https://x.example.com/',
            title: '',
            retrievedOn: '2026-10-07',
            publishedAt: null,
          },
        ],
      },
    ],
    suggestions: [
      {
        id: 'G1',
        kind: 'add_requirement' as const,
        section: 'technical_skills' as const,
        text: 'x',
        category: 'preferred' as const,
        requirementId: null,
        rationale: 'r',
        basedOn: ['W1'],
      },
      {
        id: 'G2',
        kind: 'add_requirement' as const,
        section: 'technical_skills' as const,
        text: 'y',
        category: 'preferred' as const,
        requirementId: null,
        rationale: 'r',
        basedOn: ['W1', 'O1'],
      },
    ],
    droppedWebItems: 0,
  };

  it('also takes the item away from the suggestions that rested on it, and drops one left with no basis', () => {
    const next = removeBenchmarkItem(report, 'W1');
    expect(next.web).toEqual([]);
    expect(next.suggestions.map((s) => [s.id, s.basedOn])).toEqual([['G2', ['O1']]]);
  });
});
