// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { SearchCriteriaEditor, criteriaAsText } from './search-criteria-editor';
import { SearchCriteriaView } from './search-criteria-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const initial = (): Record<string, unknown> => ({
  jobTitles: ['Backend Engineer', 'Software Engineer'],
  skills: ['Go'],
  industries: [],
  companies: [],
  geography: ['Seoul'],
  education: [],
  seniority: ['Senior'],
  leadershipExperience: [],
  yearsOfExperience: { min: 5, max: null },
  keywordSearch: '("Backend Engineer" OR "Software Engineer") AND Go',
});
function Harness({
  spy,
  readOnly = false,
}: {
  spy: (c: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initial());
  return (
    <SearchCriteriaEditor
      content={value}
      readOnly={readOnly}
      onChange={(n) => {
        setValue(n);
        spy(n);
      }}
    />
  );
}

describe('criteriaAsText', () => {
  it('lists only the conditions that have a value', () => {
    const text = criteriaAsText(initial() as never, (f) => f);
    expect(text).toBe(
      'jobTitles: Backend Engineer, Software Engineer\nskills: Go\ngeography: Seoul\nseniority: Senior\nyears: 5-\nkeywordSearch: ("Backend Engineer" OR "Software Engineer") AND Go',
    );
  });
});

describe('SearchCriteriaEditor', () => {
  it('shows each condition, one value per line, and the keyword search', () => {
    renderApp(<Harness spy={vi.fn()} />);
    expect((screen.getByLabelText('Job titles') as HTMLTextAreaElement).value).toBe(
      'Backend Engineer\nSoftware Engineer',
    );
    expect((screen.getByLabelText('Minimum years') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('Maximum years') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Keyword search') as HTMLTextAreaElement).value).toContain(
      'AND Go',
    );
  });

  it('saves one entry per non-blank line while still letting a new line be typed', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    const box = screen.getByLabelText('Skills');
    await user.type(box, '{enter}{enter}SQL');
    expect(spy.mock.lastCall![0].skills).toEqual(['Go', 'SQL']);
    expect((box as HTMLTextAreaElement).value).toBe('Go\n\nSQL');
  });

  it('sets and clears the years, keeping them in range', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    await user.type(screen.getByLabelText('Maximum years'), '12');
    expect(spy.mock.lastCall![0].yearsOfExperience).toEqual({ min: 5, max: 12 });
    await user.clear(screen.getByLabelText('Minimum years'));
    expect(spy.mock.lastCall![0].yearsOfExperience).toEqual({ min: null, max: 12 });
    await user.type(screen.getByLabelText('Minimum years'), '99');
    expect((spy.mock.lastCall![0].yearsOfExperience as { min: number }).min).toBe(60);
  });

  it('copies the sheet as text', async () => {
    const user = userEvent.setup();
    renderApp(<Harness spy={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Copy the sheet' }));
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toContain(
        'Job titles: Backend Engineer, Software Engineer',
      ),
    );
  });

  it('is read-only once approved', () => {
    renderApp(<Harness spy={vi.fn()} readOnly />);
    expect((screen.getByLabelText('Job titles') as HTMLTextAreaElement).readOnly).toBe(true);
  });
});

describe('SearchCriteriaView', () => {
  const base = '/api/v1/agencies/a1/positions/p1/search-criteria';
  it('shows why a run was refused (profile not confirmed)', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== base) throw new Error(`unexpected ${url.pathname}`);
      return init.method === 'POST'
        ? json({ error: { code: 'conflict', message: 'Confirm the success profile first' } }, 409)
        : json({ data: { artifactId: null, approvedVersionId: null } });
    });
    const user = userEvent.setup();
    renderApp(<SearchCriteriaView agencyId="a1" agencySlug="acme" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Write search criteria' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Confirm the success profile first'),
    );
  });

  it('says that EaseMuse does not search for the recruiter', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${base}`]: () => json({ data: { artifactId: null, approvedVersionId: null } }),
      }).impl,
    );
    renderApp(<SearchCriteriaView agencyId="a1" agencySlug="acme" positionId="p1" />);
    expect(await screen.findByText(/does not search for you/)).toBeTruthy();
  });
});
