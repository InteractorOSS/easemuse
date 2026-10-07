// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { ClientsView } from './clients-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const base = '/api/v1/agencies/a1/clients';
const client = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'Northwind',
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  positionCount: 2,
  contacts: [{ id: 'k1', name: 'Pat Kim', title: 'VP Eng', email: 'pat@nw.example', phone: null }],
  ...over,
});

describe('ClientsView', () => {
  it('lists clients with position counts and contacts', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${base}`]: () => json({ data: [client()] }) }).impl);
    renderApp(<ClientsView agencyId="a1" />);
    expect(await screen.findByRole('heading', { name: 'Northwind' })).toBeTruthy();
    expect(screen.getByText('2 positions')).toBeTruthy();
    expect(screen.getByText('Pat Kim')).toBeTruthy();
    expect(screen.getByText('pat@nw.example')).toBeTruthy();
  });

  it('says so when there are no clients, and when a search finds none', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${base}`]: () => json({ data: [] }) }).impl);
    const user = userEvent.setup();
    renderApp(<ClientsView agencyId="a1" />);
    expect(await screen.findByText('No clients yet. Add the first one.')).toBeTruthy();
    await user.type(screen.getByLabelText('Search clients'), 'zz');
    expect(await screen.findByText('No client matches that search.')).toBeTruthy();
  });

  it('creates a client and warns about a same-name client', async () => {
    const api = stubApi({
      [`GET ${base}`]: () => json({ data: [] }),
      [`POST ${base}`]: () =>
        json({ data: { client: client(), similar: [{ id: 'c0', name: 'Northwind' }] } }, 201),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<ClientsView agencyId="a1" />);
    await user.click(await screen.findByRole('button', { name: 'New client' }));
    await user.type(screen.getByLabelText('Company name'), 'Northwind');
    await user.click(screen.getByRole('button', { name: 'Create client' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({ name: 'Northwind' });
    expect(await screen.findByText(/already exists/)).toBeTruthy();
  });

  it('validates the company name before sending', async () => {
    const api = stubApi({ [`GET ${base}`]: () => json({ data: [] }) });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<ClientsView agencyId="a1" />);
    await user.click(await screen.findByRole('button', { name: 'New client' }));
    await user.type(screen.getByLabelText('Company name'), 'A');
    await user.click(screen.getByRole('button', { name: 'Create client' }));
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('archives a client', async () => {
    const api = stubApi({
      [`GET ${base}`]: () => json({ data: [client()] }),
      [`PATCH ${base}/c1`]: () => json({ data: client() }),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<ClientsView agencyId="a1" />);
    await user.click(await screen.findByRole('button', { name: 'Archive Northwind' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ archived: true });
  });

  it('adds a contact and shows why a removal is refused', async () => {
    const api = stubApi({
      [`GET ${base}`]: () => json({ data: [client()] }),
      [`POST ${base}/c1/contacts`]: () => json({ data: {} }, 201),
      [`DELETE ${base}/c1/contacts/k1`]: () =>
        json({ error: { code: 'conflict', message: 'x' } }, 409),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<ClientsView agencyId="a1" />);
    const form = await screen.findByRole('form', { name: 'Add contact' });
    await user.type(within(form).getByLabelText('Name'), 'Amy Lee');
    await user.type(within(form).getByLabelText('Email'), 'amy@nw.example');
    await user.click(within(form).getByRole('button', { name: 'Add contact' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      name: 'Amy Lee',
      email: 'amy@nw.example',
    });
    await user.click(screen.getByRole('button', { name: 'Remove Pat Kim' }));
    expect(await screen.findByText(/hiring manager or has portal access/)).toBeTruthy();
  });

  it('hides the contact form on archived clients', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${base}`]: () => json({ data: [client({ archivedAt: '2026-10-02T00:00:00.000Z' })] }),
      }).impl,
    );
    renderApp(<ClientsView agencyId="a1" />);
    expect(await screen.findByText('(Archived)')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Add contact' })).toBeNull();
  });
});
