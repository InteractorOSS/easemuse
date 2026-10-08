// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { OutreachPanel } from './outreach-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json({ data: body }, { status });
const api = '/api/v1/agencies/a1';
const template = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Template ${id}`,
  channel: 'email',
  body: 'Hi {{first_name}}',
  clientId: null,
  clientName: null,
  shared: false,
  ownerId: 'u1',
  canEdit: true,
  updatedAt: '2026-10-07T00:00:00Z',
  ...over,
});

describe('template picker in the outreach composer (T-5-11)', () => {
  it('offers the templates for the touch’s channel and starts the draft from the chosen one', async () => {
    const stub = stubApi({
      [`GET ${api}/pipeline/e1/outreach`]: () =>
        json({
          doNotContact: false,
          doNotContactReason: null,
          hasEmail: true,
          names: { firstName: 'Jane', recruiter: 'Sam' },
          recentlyContacted: null,
          touches: [
            {
              touchNumber: 1,
              channel: 'email',
              status: 'planned',
              dueAt: '2026-10-20T00:00:00Z',
              sentAt: null,
              response: null,
              artifactId: null,
              approvedVersionId: null,
            },
          ],
        }),
      [`GET ${api}/outreach-templates`]: () =>
        json([
          template('a', { name: 'Warm intro', shared: true, ownerId: null }),
          template('b', { name: 'Northwind pitch', clientId: 'c1', clientName: 'Northwind' }),
          template('c', { name: 'LinkedIn note', channel: 'linkedin' }),
        ]),
      [`POST ${api}/pipeline/e1/touches/1/draft`]: () =>
        Response.json({ error: { code: 'conflict', message: 'x' } }, { status: 409 }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<OutreachPanel agencyId="a1" entryId="e1" onChanged={() => undefined} />);
    const picker = await screen.findByLabelText('Start from a template');
    const options = [...picker.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual([
      'No template',
      'Warm intro (agency template)',
      'Northwind pitch (Northwind)',
    ]);
    expect(
      stub.calls
        .find((c) => c.url.pathname.endsWith('/outreach-templates'))!
        .url.searchParams.get('entryId'),
    ).toBe('e1');
    await user.selectOptions(picker, 'b');
    await user.click(screen.getByRole('button', { name: 'Write a draft' }));
    await waitFor(() => {
      const post = stub.calls.find((c) => c.method === 'POST');
      expect(post?.body).toMatchObject({ templateId: 'b' });
    });
  });

  it('shows no picker when there is no template for the channel', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${api}/pipeline/e1/outreach`]: () =>
          json({
            doNotContact: false,
            doNotContactReason: null,
            hasEmail: true,
            names: { firstName: 'Jane', recruiter: 'Sam' },
            recentlyContacted: null,
            touches: [
              {
                touchNumber: 1,
                channel: 'email',
                status: 'planned',
                dueAt: null,
                sentAt: null,
                response: null,
                artifactId: null,
                approvedVersionId: null,
              },
            ],
          }),
        [`GET ${api}/outreach-templates`]: () => json([template('c', { channel: 'linkedin' })]),
      }).impl,
    );
    renderApp(<OutreachPanel agencyId="a1" entryId="e1" onChanged={() => undefined} />);
    await screen.findByRole('button', { name: 'Write a draft' });
    expect(screen.queryByLabelText('Start from a template')).toBeNull();
  });
});
