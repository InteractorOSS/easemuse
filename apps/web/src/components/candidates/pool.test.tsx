// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { GlobalSearch } from '@/components/search/global-search';
import { CandidatesPool } from './candidates-pool';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const api = '/api/v1/agencies/a1/candidates';
const person = (n: number, over: Record<string, unknown> = {}) => ({
  id: `c${n}`,
  fullName: `Person ${n}`,
  currentTitle: 'HR Director',
  location: 'Seoul',
  seniority: 'Director',
  skills: ['payroll', 'Workday'],
  yearsExperience: 12,
  availability: null,
  lastContactedAt: null,
  doNotContact: false,
  tags: [],
  rank: null,
  ...over,
});

describe('CandidatesPool', () => {
  it('lists candidates with links to their pages', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${api}`]: () => json({ data: [person(1), person(2)] }) }).impl,
    );
    renderApp(<CandidatesPool agencyId="a1" agencySlug="acme" />);
    const link = await screen.findByRole('link', { name: 'Person 1' });
    expect(link.getAttribute('href')).toBe('/a/acme/candidates/c1');
    expect(screen.getByText('2 candidates shown')).toBeTruthy();
    expect(screen.getAllByText('12 years')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Add candidate' }).getAttribute('href')).toBe(
      '/a/acme/candidates/new',
    );
  });

  it('sends the text and filters, and marks what matched', async () => {
    const stub = stubApi({ [`GET ${api}`]: () => json({ data: [person(1)] }) });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<CandidatesPool agencyId="a1" agencySlug="acme" />);
    await screen.findByRole('link', { name: 'Person 1' });
    await user.type(screen.getByLabelText('Search candidates'), 'hr dir');
    await user.type(screen.getByLabelText('Skills (all of)'), 'payroll,workday');
    await user.type(screen.getByLabelText('Location'), 'seoul');
    await user.type(screen.getByLabelText('Years of experience, from'), '5');
    await waitFor(() => {
      const last = stub.calls.at(-1)!.url.searchParams;
      expect(Object.fromEntries(last)).toMatchObject({
        q: 'hr dir',
        skills: 'payroll,workday',
        location: 'seoul',
        minYears: '5',
        limit: '25',
      });
    });
    await waitFor(() => expect(document.querySelectorAll('mark').length).toBeGreaterThan(0));
    expect(
      Array.from(document.querySelectorAll('mark')).map((m) => m.textContent?.toLowerCase()),
    ).toEqual(expect.arrayContaining(['hr', 'dir']));
  });

  it('starts with a search text from the address', async () => {
    const stub = stubApi({ [`GET ${api}`]: () => json({ data: [] }) });
    vi.stubGlobal('fetch', stub.impl);
    renderApp(
      <CandidatesPool
        agencyId="a1"
        agencySlug="acme"
        initial={{
          q: 'payroll',
          skills: '',
          location: '',
          seniority: '',
          minYears: '',
          maxYears: '',
        }}
      />,
    );
    await waitFor(() => expect(stub.calls[0]!.url.searchParams.get('q')).toBe('payroll'));
    expect((screen.getByLabelText('Search candidates') as HTMLInputElement).value).toBe('payroll');
  });

  it('shows more with the cursor, and says so when nothing matches', async () => {
    const stub = stubApi({
      [`GET ${api}`]: (url) =>
        url.searchParams.get('cursor') === 'next'
          ? json({ data: [person(2)], nextCursor: null })
          : json({ data: [person(1)], nextCursor: 'next' }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<CandidatesPool agencyId="a1" agencySlug="acme" />);
    await user.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByRole('link', { name: 'Person 2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('says no candidate matches when a search finds none, and no candidates yet otherwise', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${api}`]: () => json({ data: [] }) }).impl);
    const user = userEvent.setup();
    renderApp(<CandidatesPool agencyId="a1" agencySlug="acme" />);
    expect(await screen.findByText('No candidates yet. Add the first one.')).toBeTruthy();
    await user.type(screen.getByLabelText('Search candidates'), 'zzz');
    expect(await screen.findByText('No candidate matches this search.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('No candidates yet. Add the first one.')).toBeTruthy();
  });

  it('flags a do-not-contact candidate', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ [`GET ${api}`]: () => json({ data: [person(1, { doNotContact: true })] }) }).impl,
    );
    renderApp(<CandidatesPool agencyId="a1" agencySlug="acme" />);
    expect(await screen.findByText('Do not contact')).toBeTruthy();
  });
});

describe('GlobalSearch', () => {
  const path = '/api/v1/agencies/acme/search';
  const results = {
    data: {
      clients: [{ id: 'k1', name: 'Northwind Traders', archived: false }],
      positions: [
        { id: 'p1', title: 'Payroll Manager', clientName: 'Northwind Traders', status: 'sourcing' },
      ],
      candidates: [
        { id: 'c1', fullName: 'Dana Cho', currentTitle: 'Payroll Manager', location: 'Seoul' },
      ],
    },
  };

  it('waits for two letters, then shows clients, positions and candidates as links', async () => {
    const stub = stubApi({ [`GET ${path}`]: () => json(results) });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<GlobalSearch agencySlug="acme" />);
    const box = screen.getByRole('searchbox', { name: 'Search clients, positions and candidates' });
    await user.type(box, 'p');
    expect(stub.calls).toHaveLength(0);
    await user.type(box, 'ay');
    const link = await screen.findByRole('link', { name: /Dana Cho/ });
    expect(link.getAttribute('href')).toBe('/a/acme/candidates/c1');
    expect(
      screen.getByRole('link', { name: /Payroll Manager Northwind Traders/ }).getAttribute('href'),
    ).toBe('/a/acme/positions/p1');
    expect(screen.getByRole('link', { name: 'Northwind Traders' }).getAttribute('href')).toBe(
      '/a/acme/clients?q=Northwind%20Traders',
    );
    expect(stub.calls.at(-1)!.url.searchParams.get('q')).toBe('pay');
  });

  it('says when nothing is found, and closes with Escape', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () => json({ data: { clients: [], positions: [], candidates: [] } }),
      }).impl,
    );
    const user = userEvent.setup();
    renderApp(<GlobalSearch agencySlug="acme" />);
    const box = screen.getByRole('searchbox');
    await user.type(box, 'zzzz');
    const panel = (await screen.findByText('Nothing found.')).closest('div')!;
    expect(panel.hasAttribute('hidden')).toBe(false);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(panel.hasAttribute('hidden')).toBe(true));
    void within;
  });

  it('shows an error when the search fails', async () => {
    vi.stubGlobal('fetch', async () => json({ error: { code: 'x', message: 'x' } }, 500));
    const user = userEvent.setup();
    renderApp(<GlobalSearch agencySlug="acme" />);
    await user.type(screen.getByRole('searchbox'), 'dana');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Search is not available right now.',
    );
  });
});
