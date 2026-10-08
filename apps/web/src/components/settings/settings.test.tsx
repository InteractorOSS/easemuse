// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MATCH_WEIGHTS,
  DEFAULT_REJECTION_REASONS,
  parseAgencySettings,
} from '@easemuse/core';
import { renderApp, renderWithIntl, stubApi } from '@/test/render';
import { DefaultsForm } from './defaults-form';
import { SettingsNav } from './settings-nav';
import { UsageSummary } from './usage-summary';

const pathname = '/a/acme/settings/defaults';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const path = '/api/v1/agencies/a1/settings';
const defaults = parseAgencySettings({});

describe('SettingsNav', () => {
  const links = (role: 'admin' | 'lead' | 'recruiter') => {
    renderWithIntl(<SettingsNav agencySlug="acme" role={role} />);
    return screen.getAllByRole('link').map((l) => l.textContent);
  };
  it('shows each role only the sections it may open', () => {
    expect(links('admin')).toEqual([
      'Members',
      'Defaults',
      'Branding',
      'Privacy requests',
      'AI usage',
      'Outbox',
    ]);
  });
  it('hides usage from leads and members from recruiters', () => {
    expect(links('lead')).toEqual(['Members', 'Defaults', 'Privacy requests']);
  });
  it('shows recruiters only the defaults', () => {
    expect(links('recruiter')).toEqual(['Defaults']);
  });
  it('marks the current section', () => {
    renderWithIntl(<SettingsNav agencySlug="acme" role="admin" />);
    expect(screen.getByRole('link', { name: 'Defaults' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

describe('DefaultsForm', () => {
  const serve = (extra: Record<string, () => Response> = {}) => {
    const api = stubApi({ [`GET ${path}`]: () => json({ data: defaults }), ...extra });
    vi.stubGlobal('fetch', api.impl);
    return api;
  };

  it('shows the current defaults, including the brief weights and 4 / 7 / 30', async () => {
    serve();
    renderApp(<DefaultsForm agencyId="a1" canEdit />);
    expect(((await screen.findByLabelText('Core competencies')) as HTMLInputElement).value).toBe(
      '40',
    );
    expect(
      (screen.getByLabelText('Compensation / other requirements') as HTMLInputElement).value,
    ).toBe('5');
    expect(screen.getByText('Total: 100 of 100')).toBeTruthy();
    expect(
      (screen.getByLabelText('Days from the first message to the follow-up') as HTMLInputElement)
        .value,
    ).toBe('4');
    expect(
      (screen.getByLabelText('Days from the follow-up to the final follow-up') as HTMLInputElement)
        .value,
    ).toBe('7');
    expect(
      (screen.getByLabelText(/Warn if a candidate was contacted/) as HTMLInputElement).value,
    ).toBe('30');
    expect(
      (screen.getByLabelText('One reason per line') as HTMLTextAreaElement).value.split('\n'),
    ).toEqual([...DEFAULT_REJECTION_REASONS]);
  });

  it('keeps a running total and refuses to save weights that do not add up to 100', async () => {
    const api = serve({ [`PATCH ${path}`]: () => json({ data: defaults }) });
    const user = userEvent.setup();
    renderApp(<DefaultsForm agencyId="a1" canEdit />);
    const core = await screen.findByLabelText('Core competencies');
    await user.clear(core);
    await user.type(core, '45');
    expect(screen.getByText('Total: 105 of 100')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The weights must add up to 100 (now 105).',
    );
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('saves a valid change, sending the whole form', async () => {
    const api = serve({ [`PATCH ${path}`]: () => json({ data: defaults }) });
    const user = userEvent.setup();
    renderApp(<DefaultsForm agencyId="a1" canEdit />);
    const core = await screen.findByLabelText('Core competencies');
    await user.clear(core);
    await user.type(core, '35');
    const relevant = screen.getByLabelText('Relevant experience');
    await user.clear(relevant);
    await user.type(relevant, '25');
    await user.selectOptions(
      screen.getByLabelText(/Submitting without the candidate's consent/),
      'warn',
    );
    await user.selectOptions(
      screen.getByLabelText('Positions visible to recruiters'),
      'own_and_shared',
    );
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
    const body = api.calls.find((c) => c.method === 'PATCH')!.body as Record<string, unknown>;
    expect(body.defaultMatchingWeights).toEqual({
      ...DEFAULT_MATCH_WEIGHTS,
      coreCompetencies: 35,
      relevantExperience: 25,
    });
    expect(body.guardModes).toMatchObject({ consent: 'warn', jdApproval: 'block' });
    expect(body.visibility).toBe('own_and_shared');
    expect(body.outreachIntervalsDays).toEqual([4, 7]);
    expect(await screen.findByText('Defaults saved.')).toBeTruthy();
  });

  it('validates the rejection reasons list', async () => {
    serve();
    const user = userEvent.setup();
    renderApp(<DefaultsForm agencyId="a1" canEdit />);
    const box = await screen.findByLabelText('One reason per line');
    await user.clear(box);
    await user.type(box, 'Too junior{enter}too junior');
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Enter 1 to 30 different reasons, each 2 to 60 characters.',
    );
  });

  it('is read-only for people who are not admins', async () => {
    serve();
    renderApp(<DefaultsForm agencyId="a1" canEdit={false} />);
    expect(await screen.findByText('Only an admin can change these.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save defaults' })).toBeNull();
    expect(
      within(screen.getByRole('group', { name: 'Matching weights' }))
        .getByLabelText('Core competencies')
        .matches(':disabled'),
    ).toBe(true);
  });

  it('tells the user when saving fails', async () => {
    serve({
      [`PATCH ${path}`]: () => json({ error: { code: 'invalid_input', message: 'x' } }, 422),
    });
    const user = userEvent.setup();
    renderApp(<DefaultsForm agencyId="a1" canEdit />);
    await user.click(await screen.findByRole('button', { name: 'Save defaults' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not save. Check the values and try again.',
    );
  });
});

describe('UsageSummary', () => {
  const usage = (over: Record<string, unknown> = {}) => ({
    data: {
      month: '2026-10',
      budget: { spentUsd: 85, limitUsd: 100, ratio: 0.85, level: 'warning' },
      byPurpose: [
        {
          key: 'jd.structure',
          label: null,
          calls: 12,
          inputTokens: 1,
          outputTokens: 1,
          cachedTokens: 0,
          costUsd: 60,
        },
        {
          key: 'match.analyze',
          label: null,
          calls: 3,
          inputTokens: 1,
          outputTokens: 1,
          cachedTokens: 0,
          costUsd: 25,
        },
      ],
      totals: { calls: 15, inputTokens: 2, outputTokens: 2, costUsd: 85 },
      ...over,
    },
  });

  it('shows the spend against the budget with its level, and cost per purpose', async () => {
    vi.stubGlobal('fetch', stubApi({ 'GET /api/v1/agencies/a1/usage': () => json(usage()) }).impl);
    renderApp(<UsageSummary agencyId="a1" />);
    expect(await screen.findByText('$85.00 of $100.00 used')).toBeTruthy();
    expect(screen.getByText('Over 80% of the budget')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Cost by purpose' });
    expect(within(table).getByText('jd.structure')).toBeTruthy();
    expect(within(table).getByRole('row', { name: /Total/ }).textContent).toContain('$85.00');
  });

  it('explains that AI pauses when the budget is used, and handles no limit and no use', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/v1/agencies/a1/usage': () =>
          json(usage({ budget: { spentUsd: 100, limitUsd: 100, ratio: 1, level: 'over' } })),
      }).impl,
    );
    const { unmount } = renderApp(<UsageSummary agencyId="a1" />);
    expect(
      await screen.findByText('Budget used: AI drafting is paused, everything else keeps working'),
    ).toBeTruthy();
    unmount();
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/v1/agencies/a1/usage': () =>
          json(
            usage({
              budget: { spentUsd: 0, limitUsd: null, ratio: null, level: 'ok' },
              byPurpose: [],
              totals: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
            }),
          ),
      }).impl,
    );
    renderApp(<UsageSummary agencyId="a1" />);
    expect(await screen.findByText('No monthly limit is set.')).toBeTruthy();
    expect(screen.getByText('No AI use this month.')).toBeTruthy();
  });
});
