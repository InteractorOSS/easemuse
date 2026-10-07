// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JD_SECTIONS } from '@easemuse/core';
import { renderApp, renderWithIntl, stubApi } from '@/test/render';
import { StructuredJdEditor } from './structured-jd-editor';
import { StructureJdView } from './structure-jd-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });

const make = (missing: string[] = ['compensation']) => ({
  sections: Object.fromEntries(
    JD_SECTIONS.map((s) => [
      s,
      missing.includes(s)
        ? { status: 'missing', summary: '' }
        : { status: 'found', summary: `about ${s}` },
    ]),
  ),
  requirements: [
    {
      id: 'r1',
      section: 'technical_skills',
      text: 'Go',
      category: 'must_have',
      quote: 'Go required',
    },
    { id: 'r2', section: 'location', text: 'Remote OK', category: 'preferred', quote: '' },
  ],
});

/** Holds the content like the generic editor does, and exposes the latest value. */
function Harness({
  initial,
  readOnly = false,
  spy,
}: {
  initial: Record<string, unknown>;
  readOnly?: boolean;
  spy: (c: Record<string, unknown>) => void;
}) {
  const [content, setContent] = useState(initial);
  return (
    <StructuredJdEditor
      content={content}
      readOnly={readOnly}
      onChange={(next) => {
        setContent(next);
        spy(next);
      }}
    />
  );
}
const reqs = (c: Record<string, unknown>) =>
  (c.requirements as { id: string; text: string; category: string }[]).map((r) => [
    r.id,
    r.text,
    r.category,
  ]);

describe('StructuredJdEditor', () => {
  it('lists the missing sections for the hiring manager and marks them in the form', () => {
    renderWithIntl(
      <Harness initial={make(['compensation', 'work_authorization'])} spy={vi.fn()} />,
    );
    const list = within(
      screen.getByRole('heading', { name: /Missing from the JD/ }).parentElement!,
    ).getAllByRole('listitem');
    expect(list.map((li) => li.textContent)).toEqual(['Compensation', 'Work authorization']);
    expect(screen.getAllByText('Missing, ask the hiring manager')).toHaveLength(2);
    expect(
      (screen.getByLabelText('Summary of Position summary') as HTMLTextAreaElement).value,
    ).toBe('about position_summary');
  });

  it('flips a section between missing and found as its summary is written or cleared', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<Harness initial={make(['compensation'])} spy={spy} />);
    await user.type(screen.getByLabelText('Summary of Compensation'), 'KRW 100M');
    const sections = spy.mock.lastCall![0].sections as Record<
      string,
      { status: string; summary: string }
    >;
    expect(sections.compensation).toEqual({ status: 'found', summary: 'KRW 100M' });
    await user.clear(screen.getByLabelText('Summary of Location'));
    expect((spy.mock.lastCall![0].sections as typeof sections).location!.status).toBe('missing');
  });

  it('changes a requirement category and keeps one category per requirement', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<Harness initial={make()} spy={spy} />);
    await user.selectOptions(screen.getByLabelText('Category of requirement 2'), 'disqualifying');
    expect(reqs(spy.mock.lastCall![0])).toEqual([
      ['r1', 'Go', 'must_have'],
      ['r2', 'Remote OK', 'disqualifying'],
    ]);
  });

  it('reorders, edits and deletes requirements', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<Harness initial={make()} spy={spy} />);
    await user.click(screen.getByRole('button', { name: 'Move requirement 2 up' }));
    expect(reqs(spy.mock.lastCall![0]).map((r) => r[0])).toEqual(['r2', 'r1']);
    expect(
      (screen.getByRole('button', { name: 'Move requirement 1 up' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.type(screen.getByLabelText('Requirement 1'), '!');
    expect(reqs(spy.mock.lastCall![0])[0]![1]).toBe('Remote OK!');
    await user.click(screen.getByRole('button', { name: 'Remove requirement 2' }));
    expect(reqs(spy.mock.lastCall![0]).map((r) => r[0])).toEqual(['r2']);
  });

  it('adds a requirement with a new id, in the chosen category', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<Harness initial={make()} spy={spy} />);
    const add = screen.getByRole('button', { name: 'Add requirement' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('New requirement'), 'No agency submissions');
    await user.selectOptions(screen.getByLabelText('New requirement category'), 'disqualifying');
    await user.click(add);
    const list = reqs(spy.mock.lastCall![0]);
    expect(list).toHaveLength(3);
    expect(list[2]![1]).toBe('No agency submissions');
    expect(list[2]![2]).toBe('disqualifying');
    expect(new Set(list.map((r) => r[0])).size).toBe(3);
  });

  it('is read-only for an approved version', () => {
    renderWithIntl(<Harness initial={make()} readOnly spy={vi.fn()} />);
    expect((screen.getByLabelText('Requirement 1') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Add requirement' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Move requirement/ })).toBeNull();
  });

  it('says so when the content is not a structured JD', () => {
    renderWithIntl(<Harness initial={{ foo: 1 }} spy={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('cannot be shown as a form');
  });
});

describe('StructureJdView', () => {
  const base = '/api/v1/agencies/a1/positions/p1';
  it('offers Structure JD before any draft, and shows approved requirements', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${base}/structured-jd`]: () =>
          json({
            data: {
              artifactId: null,
              approvedVersionId: null,
              requirements: [
                {
                  id: 'r1',
                  section: 'location',
                  text: 'Seoul',
                  category: 'must_have',
                  sortOrder: 0,
                },
              ],
            },
          }),
      }).impl,
    );
    renderApp(<StructureJdView agencyId="a1" agencySlug="acme" positionId="p1" />);
    expect(await screen.findByRole('button', { name: 'Structure JD' })).toBeTruthy();
    expect(await screen.findByText(/Seoul/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the position' }).getAttribute('href')).toBe(
      '/a/acme/positions/p1',
    );
  });

  it('shows why a run was refused (no JD yet)', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname.endsWith('/structured-jd'))
        return json({ data: { artifactId: null, approvedVersionId: null, requirements: [] } });
      if (init.method === 'POST')
        return json(
          {
            error: {
              code: 'unreadable_document',
              message: "Add the client's job description first",
            },
          },
          422,
        );
      throw new Error(`unexpected ${url.pathname}`);
    });
    const user = userEvent.setup();
    renderApp(<StructureJdView agencyId="a1" agencySlug="acme" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Structure JD' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        "Add the client's job description first",
      ),
    );
  });
});
