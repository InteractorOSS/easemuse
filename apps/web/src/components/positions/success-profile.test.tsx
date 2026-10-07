// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/render';
import { SuccessProfileEditor } from './success-profile-editor';
import { SuccessProfileView } from './success-profile-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const initial = (): Record<string, unknown> => ({
  summary: 'A senior engineer',
  criteria: [
    { id: 'c1', text: 'Go', category: 'must_have', basis: 'jd' },
    { id: 'c2', text: 'No competitors', category: 'disqualifying', basis: 'intake' },
  ],
  expectations: { sixMonths: 'On-call', twelveMonths: 'Lead' },
  keyChallenges: ['Cut incidents', 'Hire two'],
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
    <SuccessProfileEditor
      content={value}
      readOnly={readOnly}
      onChange={(n) => {
        setValue(n);
        spy(n);
      }}
    />
  );
}
const criteria = (c: Record<string, unknown>) => c.criteria as { id: string; category: string }[];

describe('SuccessProfileEditor', () => {
  it('shows summary, criteria, expectations, challenges and the deal-breaker count', () => {
    renderApp(<Harness spy={vi.fn()} />);
    expect((screen.getByLabelText('Summary') as HTMLTextAreaElement).value).toBe(
      'A senior engineer',
    );
    expect((screen.getByLabelText('Criterion 2') as HTMLInputElement).value).toBe('No competitors');
    expect(screen.getByText('Deal-breakers: 1')).toBeTruthy();
    expect((screen.getByLabelText('After 6 months') as HTMLTextAreaElement).value).toBe('On-call');
    expect(
      (screen.getByLabelText('Key challenges, one per line') as HTMLTextAreaElement).value,
    ).toBe('Cut incidents\nHire two');
  });

  it('changes a category, reorders and removes criteria', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    await user.selectOptions(screen.getByLabelText('Category of criterion 1'), 'disqualifying');
    expect(criteria(spy.mock.lastCall![0]).map((c) => c.category)).toEqual([
      'disqualifying',
      'disqualifying',
    ]);
    await user.click(screen.getByRole('button', { name: 'Move criterion 2 up' }));
    expect(criteria(spy.mock.lastCall![0]).map((c) => c.id)).toEqual(['c2', 'c1']);
    await user.click(screen.getByRole('button', { name: 'Remove criterion 1' }));
    expect(criteria(spy.mock.lastCall![0]).map((c) => c.id)).toEqual(['c1']);
  });

  it('adds a criterion in the chosen category, marked as coming from the intake', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    await user.type(screen.getByLabelText('New criterion'), 'Open to relocation');
    await user.selectOptions(screen.getByLabelText('New criterion category'), 'preferred');
    await user.click(screen.getByRole('button', { name: 'Add criterion' }));
    const last = criteria(spy.mock.lastCall![0]).at(-1) as unknown as {
      text: string;
      category: string;
      basis: string;
    };
    expect(last).toMatchObject({
      text: 'Open to relocation',
      category: 'preferred',
      basis: 'intake',
    });
  });

  it('edits challenges one per line, dropping blank lines', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    const box = screen.getByLabelText('Key challenges, one per line');
    await user.clear(box);
    await user.type(box, 'One{enter}{enter}Two');
    expect(spy.mock.lastCall![0].keyChallenges).toEqual(['One', 'Two']);
  });

  it('is read-only once confirmed', () => {
    renderApp(<Harness spy={vi.fn()} readOnly />);
    expect((screen.getByLabelText('Criterion 1') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Add criterion' })).toBeNull();
  });
});

describe('SuccessProfileView', () => {
  const base = '/api/v1/agencies/a1/positions/p1/success-profile';
  const serve = (post: () => Response) =>
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== base) throw new Error(`unexpected ${url.pathname}`);
      return init.method === 'POST'
        ? post()
        : json({ data: { artifactId: null, approvedVersionId: null } });
    });

  it('explains a blocking guard and offers no way round it', async () => {
    serve(() =>
      json(
        {
          error: {
            code: 'guard_failed',
            message: 'x',
            guards: [{ guard: 'jdApproval', mode: 'block', message: 'No approval.' }],
          },
        },
        409,
      ),
    );
    const user = userEvent.setup();
    renderApp(<SuccessProfileView agencyId="a1" agencySlug="acme" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Write success profile' }));
    expect(
      await screen.findByText('The hiring manager has not approved the job description'),
    ).toBeTruthy();
    expect(screen.getByText("Record the hiring manager's decision first.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Write it anyway' })).toBeNull();
  });

  it('sends the override with the reason in warn mode', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      if (init.method !== 'POST')
        return json({ data: { artifactId: null, approvedVersionId: null } });
      bodies.push(init.body ? JSON.parse(String(init.body)) : undefined);
      return json(
        {
          error: {
            code: 'guard_failed',
            message: 'x',
            guards: [{ guard: 'jdApproval', mode: 'warn', message: 'No approval.' }],
          },
        },
        409,
      );
      void url;
    });
    const user = userEvent.setup();
    renderApp(<SuccessProfileView agencyId="a1" agencySlug="acme" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Write success profile' }));
    const go = await screen.findByRole('button', { name: 'Write it anyway' });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Reason for going ahead'), 'HM approved by phone');
    await user.click(go);
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({
      overrideGuards: [{ guard: 'jdApproval', reason: 'HM approved by phone' }],
    });
  });

  it('says matching needs a confirmed profile while none is confirmed', async () => {
    serve(() => json({}, 500));
    renderApp(<SuccessProfileView agencyId="a1" agencySlug="acme" positionId="p1" />);
    expect(await screen.findByText(/Matching needs a confirmed profile/)).toBeTruthy();
  });
});
