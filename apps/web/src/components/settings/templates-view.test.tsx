// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { TemplatesView } from './templates-view';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const api = '/api/v1/agencies/a1';
const tpl = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Template ${id}`,
  channel: 'email',
  body: 'Hi {{first_name}}, a role for you.',
  clientId: null,
  clientName: null,
  shared: false,
  ownerId: 'u1',
  canEdit: true,
  updatedAt: '2026-10-07T00:00:00Z',
  ...over,
});
const serve = (templates: unknown[], extra: Record<string, () => Response> = {}) => {
  const stub = stubApi({
    [`GET ${api}/outreach-templates`]: () => json(templates),
    [`GET ${api}/clients`]: () =>
      json([{ id: '11111111-1111-4111-8111-111111111111', name: 'Northwind' }]),
    ...extra,
  });
  vi.stubGlobal('fetch', stub.impl);
  return stub;
};

describe('TemplatesView (T-5-11)', () => {
  it('lists templates with their scope, and offers edit and delete only where allowed', async () => {
    serve([
      tpl('a', { name: 'House style', shared: true, ownerId: null, canEdit: false }),
      tpl('b', {
        name: 'For Northwind',
        clientId: '11111111-1111-4111-8111-111111111111',
        clientName: 'Northwind',
      }),
    ]);
    const { container } = renderApp(<TemplatesView agencyId="a1" canShare={false} />);
    expect(await screen.findByText('House style')).toBeTruthy();
    expect(screen.getByText('Agency')).toBeTruthy();
    expect(screen.getByText('For Northwind', { selector: 'span' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit For Northwind' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit House style' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('creates a personal template; only a lead sees the share box', async () => {
    const stub = serve([], { [`POST ${api}/outreach-templates`]: () => json(tpl('n'), 201) });
    const user = userEvent.setup();
    renderApp(<TemplatesView agencyId="a1" canShare={false} />);
    await user.click(await screen.findByRole('button', { name: 'New template' }));
    expect(screen.queryByLabelText(/Share with the whole agency/)).toBeNull();
    await user.type(screen.getByLabelText('Name'), 'Warm intro');
    await user.click(screen.getByLabelText('Message'));
    await user.paste('Hi {{first_name}}, I saw your work.');
    await user.selectOptions(
      screen.getByLabelText('Only for client'),
      '11111111-1111-4111-8111-111111111111',
    );
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({
        name: 'Warm intro',
        channel: 'email',
        body: 'Hi {{first_name}}, I saw your work.',
        clientId: '11111111-1111-4111-8111-111111111111',
        shared: false,
      }),
    );
  });

  it('lets a lead share a template, and checks the message before sending', async () => {
    const stub = serve([], { [`POST ${api}/outreach-templates`]: () => json(tpl('n'), 201) });
    const user = userEvent.setup();
    renderApp(<TemplatesView agencyId="a1" canShare />);
    await user.click(await screen.findByRole('button', { name: 'New template' }));
    await user.type(screen.getByLabelText('Name'), 'X');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not save the template/);
    expect(stub.calls.some((c) => c.method === 'POST')).toBe(false);
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'House style');
    await user.click(screen.getByLabelText('Message'));
    await user.paste('Hi {{first_name}}, an opening.');
    await user.click(screen.getByLabelText(/Share with the whole agency/));
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ shared: true }),
    );
  });

  it('edits and deletes a template of your own', async () => {
    const stub = serve([tpl('b', { name: 'Mine' })], {
      [`PATCH ${api}/outreach-templates/b`]: () => json(tpl('b')),
      [`DELETE ${api}/outreach-templates/b`]: () => new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    renderApp(<TemplatesView agencyId="a1" canShare={false} />);
    await user.click(await screen.findByRole('button', { name: 'Edit Mine' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Mine v2');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(stub.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ name: 'Mine v2' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Delete Mine' }));
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'DELETE')).toBe(true));
  });
});
