// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntakeQuestionsContent } from '@easemuse/core';
import { renderApp, stubApi } from '@/test/render';
import { IntakeQuestionsEditor, questionsAsText } from './intake-questions-editor';
import { IntakeQuestionsView } from './intake-questions-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const content = (): Record<string, unknown> => ({
  questions: [
    {
      id: 'q1',
      topic: 'jd_gap',
      section: 'compensation',
      question: 'What is the pay range?',
      reason: 'The JD has none',
    },
    { id: 'q2', topic: 'business_reason', question: 'Why is the seat open?', reason: '' },
    { id: 'q3', topic: 'business_reason', question: 'Why now?', reason: '' },
  ],
});

function Harness({
  spy,
  readOnly = false,
}: {
  spy: (c: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(content());
  return (
    <IntakeQuestionsEditor
      content={value}
      readOnly={readOnly}
      onChange={(next) => {
        setValue(next);
        spy(next);
      }}
    />
  );
}
const ids = (c: Record<string, unknown>) => (c.questions as { id: string }[]).map((q) => q.id);

describe('questionsAsText', () => {
  it('groups by topic in the brief order, numbered, skipping empty topics', () => {
    const text = questionsAsText(content() as unknown as IntakeQuestionsContent, (t) => `[${t}]`);
    expect(text).toBe(
      '[jd_gap]\n1. What is the pay range?\n\n[business_reason]\n1. Why is the seat open?\n2. Why now?',
    );
  });
});

describe('IntakeQuestionsEditor', () => {
  it('shows each question with its topic and why it is asked', () => {
    renderApp(<Harness spy={vi.fn()} />);
    expect((screen.getByLabelText('Question 1') as HTMLInputElement).value).toBe(
      'What is the pay range?',
    );
    expect(within(screen.getAllByRole('listitem')[0]!).getByText('Gap in the JD')).toBeTruthy();
    expect(screen.getByText('Why: The JD has none')).toBeTruthy();
  });

  it('edits, reorders and removes questions', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    await user.type(screen.getByLabelText('Question 2'), '?');
    expect((spy.mock.lastCall![0].questions as { question: string }[])[1]!.question).toBe(
      'Why is the seat open??',
    );
    await user.click(screen.getByRole('button', { name: 'Move question 3 up' }));
    expect(ids(spy.mock.lastCall![0])).toEqual(['q1', 'q3', 'q2']);
    await user.click(screen.getByRole('button', { name: 'Remove question 1' }));
    expect(ids(spy.mock.lastCall![0])).toEqual(['q3', 'q2']);
  });

  it('adds a question under a chosen topic', async () => {
    const spy = vi.fn();
    const user = userEvent.setup();
    renderApp(<Harness spy={spy} />);
    const add = screen.getByRole('button', { name: 'Add question' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('New question'), 'Who signs off the offer?');
    await user.selectOptions(screen.getByLabelText('New question topic'), 'interview_process');
    await user.click(add);
    const last = (spy.mock.lastCall![0].questions as { topic: string; question: string }[]).at(-1)!;
    expect(last).toMatchObject({
      topic: 'interview_process',
      question: 'Who signs off the offer?',
    });
  });

  it('copies the whole list to the clipboard', async () => {
    const user = userEvent.setup(); // installs a clipboard stub we can read back
    renderApp(<Harness spy={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Copy all' }));
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toContain('1. What is the pay range?'),
    );
  });

  it('is read-only when approved', () => {
    renderApp(<Harness spy={vi.fn()} readOnly />);
    expect((screen.getByLabelText('Question 1') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Add question' })).toBeNull();
  });
});

describe('IntakeQuestionsView', () => {
  const base = '/api/v1/agencies/a1/positions/p1/intake-questions';
  it('offers to write the questions, and shows why a run was refused', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === base && init.method === 'POST')
        return json(
          { error: { code: 'conflict', message: 'Approve the structured JD first' } },
          409,
        );
      if (url.pathname === base)
        return json({ data: { artifactId: null, approvedVersionId: null } });
      throw new Error(`unexpected ${url.pathname}`);
    });
    const user = userEvent.setup();
    renderApp(<IntakeQuestionsView agencyId="a1" agencySlug="acme" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Write intake questions' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Approve the structured JD first'),
    );
  });

  it('links back to the position', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${base}`]: () => json({ data: { artifactId: null, approvedVersionId: null } }),
      }).impl,
    );
    renderApp(<IntakeQuestionsView agencyId="a1" agencySlug="acme" positionId="p1" />);
    expect(
      (await screen.findByRole('link', { name: 'Back to the position' })).getAttribute('href'),
    ).toBe('/a/acme/positions/p1');
  });
});
