// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { PositionDetail } from './position-detail';
import { PositionForm, toPayload } from './position-form';
import { PositionsList } from './positions-list';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const api = '/api/v1/agencies/a1';
const CLIENT = '11111111-1111-4111-8111-111111111111';
const position = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  clientId: CLIENT,
  clientName: 'Northwind',
  ownerId: 'u1',
  ownerName: 'Pat Owner',
  hiringManagerId: null,
  status: 'draft',
  title: 'Staff Engineer',
  department: null,
  reportingLine: null,
  location: 'Seoul',
  workArrangement: 'hybrid',
  compMin: 90000,
  compMax: 120000,
  compCurrency: 'USD',
  requiredExperience: null,
  requiredSkills: ['Go', 'SQL'],
  hiringTimeline: null,
  openings: 2,
  workAuthorization: null,
  matchingWeights: {},
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});
const OWNER = { userId: 'u1', role: 'recruiter' } as const;
const clients = {
  data: [
    {
      id: CLIENT,
      name: 'Northwind',
      archivedAt: null,
      contacts: [],
      positionCount: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
    },
  ],
};

describe('toPayload', () => {
  it('turns text into the API shape: empty to null, skills split, numbers parsed', () => {
    const payload = toPayload({
      clientId: CLIENT,
      title: 'T',
      location: 'L',
      department: '',
      reportingLine: '',
      workArrangement: '',
      compMin: '100',
      compMax: '',
      compCurrency: 'usd',
      requiredExperience: '',
      requiredSkills: ' Go, ,SQL ',
      hiringTimeline: '',
      openings: '3',
      workAuthorization: '',
    });
    expect(payload).toMatchObject({
      workArrangement: null,
      compMin: 100,
      compMax: null,
      requiredSkills: ['Go', 'SQL'],
      openings: 3,
    });
  });
});

describe('PositionsList', () => {
  it('lists positions with client, owner and status, and filters by status', async () => {
    const calls = stubApi({ [`GET ${api}/positions`]: () => json({ data: [position()] }) });
    vi.stubGlobal('fetch', calls.impl);
    const user = userEvent.setup();
    renderApp(<PositionsList agencyId="a1" agencySlug="acme" />);
    expect(await screen.findByRole('link', { name: 'Staff Engineer' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Staff Engineer' }).getAttribute('href')).toBe(
      '/a/acme/positions/p1',
    );
    expect(screen.getByText('Pat Owner')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Status'), 'sourcing');
    await waitFor(() =>
      expect(calls.calls.at(-1)!.url.searchParams.get('status')).toBe('sourcing'),
    );
  });

  it('says so when empty', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${api}/positions`]: () => json({ data: [] }) }).impl);
    renderApp(<PositionsList agencyId="a1" agencySlug="acme" />);
    expect(await screen.findByText('No positions yet. Create the first one.')).toBeTruthy();
  });
});

describe('PositionForm', () => {
  it('shows an error per required field and sends nothing', async () => {
    const stub = stubApi({ [`GET ${api}/clients`]: () => json(clients) });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<PositionForm agencyId="a1" onSaved={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Create position' }));
    expect(
      (await screen.findAllByText(/./, { selector: '[id$="-error"]' })).length,
    ).toBeGreaterThanOrEqual(3);
    expect(stub.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('creates a position from the filled-in form', async () => {
    const onSaved = vi.fn();
    const stub = stubApi({
      [`GET ${api}/clients`]: () => json(clients),
      [`POST ${api}/positions`]: () => json({ data: position() }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<PositionForm agencyId="a1" onSaved={onSaved} />);
    await screen.findByRole('option', { name: 'Northwind' });
    await user.selectOptions(screen.getByLabelText('Client'), CLIENT);
    await user.type(screen.getByLabelText('Job title'), 'Staff Engineer');
    await user.type(screen.getByLabelText('Location'), 'Seoul');
    await user.type(screen.getByLabelText('Pay minimum'), '90000');
    await user.type(screen.getByLabelText('Required skills'), 'Go, SQL');
    await user.click(screen.getByRole('button', { name: 'Create position' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      clientId: CLIENT,
      title: 'Staff Engineer',
      location: 'Seoul',
      compMin: 90000,
      requiredSkills: ['Go', 'SQL'],
    });
  });

  it('rejects a pay minimum above the maximum', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${api}/clients`]: () => json(clients) }).impl);
    const user = userEvent.setup();
    renderApp(<PositionForm agencyId="a1" position={position() as never} onSaved={vi.fn()} />);
    const min = await screen.findByLabelText('Pay minimum');
    await user.clear(min);
    await user.type(min, '500000');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('The minimum cannot be above the maximum')).toBeTruthy();
  });

  it('edits with PATCH and cannot change the client', async () => {
    const stub = stubApi({
      [`GET ${api}/clients`]: () => json(clients),
      [`PATCH ${api}/positions/p1`]: () => json({ data: position({ title: 'Principal' }) }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderApp(<PositionForm agencyId="a1" position={position() as never} onSaved={onSaved} />);
    expect((await screen.findByLabelText('Client')).matches(':disabled')).toBe(true);
    const title = screen.getByLabelText('Job title');
    await user.clear(title);
    await user.type(title, 'Principal');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const body = stub.calls.find((c) => c.method === 'PATCH')!.body as Record<string, unknown>;
    expect(body.title).toBe('Principal');
    expect(body).not.toHaveProperty('clientId');
  });
});

describe('PositionDetail', () => {
  const serve = (
    extra: Record<string, () => Response> = {},
    over: Record<string, unknown> = {},
  ) => {
    const stub = stubApi({
      [`GET ${api}/positions/p1`]: () => json({ data: position(over) }),
      [`GET ${api}/activity`]: () => json({ data: [], nextCursor: null }),
      [`GET ${api}/positions/p1/jd`]: () => json({ data: [] }),
      ...extra,
    });
    vi.stubGlobal('fetch', stub.impl);
    return stub;
  };

  it('shows the details, owner and only the status moves that are allowed', async () => {
    serve();
    renderApp(<PositionDetail agencyId="a1" positionId="p1" viewer={OWNER} />);
    expect(await screen.findByRole('heading', { name: 'Staff Engineer' })).toBeTruthy();
    expect(screen.getByText('90000 – 120000 USD')).toBeTruthy();
    expect(screen.getByText('Go, SQL')).toBeTruthy();
    expect(screen.getByText('Hybrid')).toBeTruthy();
    const options = Array.from((screen.getByLabelText('Move to') as HTMLSelectElement).options).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(['', 'Intake', 'On hold', 'Cancelled']);
  });

  it('asks for a reason before holding, then changes the status', async () => {
    const stub = serve({
      [`POST ${api}/positions/p1/status`]: () => json({ data: position({ status: 'on_hold' }) }),
    });
    const user = userEvent.setup();
    renderApp(<PositionDetail agencyId="a1" positionId="p1" viewer={OWNER} />);
    await user.selectOptions(await screen.findByLabelText('Move to'), 'on_hold');
    await user.type(screen.getByLabelText('Reason'), 'Budget freeze');
    await user.click(screen.getByRole('button', { name: 'Change status' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({
      status: 'on_hold',
      reason: 'Budget freeze',
    });
  });

  it('explains a refused status change', async () => {
    serve({
      [`POST ${api}/positions/p1/status`]: () =>
        json({ error: { code: 'conflict', message: 'x' } }, 409),
    });
    const user = userEvent.setup();
    renderApp(<PositionDetail agencyId="a1" positionId="p1" viewer={OWNER} />);
    await user.selectOptions(await screen.findByLabelText('Move to'), 'intake');
    await user.click(screen.getByRole('button', { name: 'Change status' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That status change is not allowed right now.',
    );
  });

  it('says a closed position cannot change', async () => {
    serve({}, { status: 'filled' });
    renderApp(<PositionDetail agencyId="a1" positionId="p1" viewer={OWNER} />);
    expect(
      await screen.findByText('This position is closed; its status cannot change.'),
    ).toBeTruthy();
  });

  it('hides the edit, weights and status controls from a recruiter who is not the owner', async () => {
    serve();
    renderApp(
      <PositionDetail
        agencyId="a1"
        positionId="p1"
        viewer={{ userId: 'someone-else', role: 'recruiter' }}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Staff Engineer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByLabelText('Move to')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save weights' })).toBeNull();
  });

  it('switches to the edit form', async () => {
    serve({ [`GET ${api}/clients`]: () => json(clients) });
    const user = userEvent.setup();
    renderApp(<PositionDetail agencyId="a1" positionId="p1" viewer={OWNER} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('form', { name: 'Edit position' })).toBeTruthy();
  });
});
