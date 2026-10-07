// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { EntityTimeline } from './entity-timeline';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const eid = '11111111-1111-4111-8111-111111111111';
const entry = (n: number, over: Record<string, unknown> = {}) => ({
  id: `e${n}`,
  action: 'artifact.approved',
  actorType: 'user',
  actorName: `Person ${n}`,
  data: null,
  createdAt: `2026-10-0${n}T10:00:00.000Z`,
  ...over,
});

describe('EntityTimeline', () => {
  it('lists events newest first with who and what, in plain words', async () => {
    const api = stubApi({
      'GET /api/v1/agencies/a1/activity': () =>
        json({
          data: [
            entry(3, { actorType: 'system', actorName: null, action: 'job.finished' }),
            entry(2, { action: 'member.invited' }),
            entry(1, { actorName: null }),
          ],
          nextCursor: null,
        }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<EntityTimeline agencyId="a1" entityType="position" entityId={eid} />);
    const items = (await screen.findAllByRole('listitem')).map((li) => li.textContent);
    expect(items[0]).toContain('System');
    expect(items[0]).toContain('finished a background job');
    expect(items[1]).toContain('Person 2');
    expect(items[1]).toContain('invited a member');
    expect(items[2]).toContain('Someone'); // an actor that no longer exists
    expect(api.calls[0]!.url.searchParams.get('entityType')).toBe('position');
    expect(api.calls[0]!.url.searchParams.get('entityId')).toBe(eid);
  });

  it('shows the raw action name when there is no friendly label', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/v1/agencies/a1/activity': () =>
          json({ data: [entry(1, { action: 'brand.new_action' })], nextCursor: null }),
      }).impl,
    );
    renderApp(<EntityTimeline agencyId="a1" entityType="position" entityId={eid} />);
    expect(await screen.findByText('brand.new_action')).toBeTruthy();
  });

  it('says so when empty and offers earlier activity when there is more', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({ 'GET /api/v1/agencies/a1/activity': () => json({ data: [], nextCursor: null }) })
        .impl,
    );
    const { unmount } = renderApp(
      <EntityTimeline agencyId="a1" entityType="position" entityId={eid} />,
    );
    expect(await screen.findByText('Nothing has happened here yet.')).toBeTruthy();
    unmount();

    const api = stubApi({
      'GET /api/v1/agencies/a1/activity': (url) =>
        url.searchParams.get('cursor') === 'c2'
          ? json({ data: [entry(1)], nextCursor: null })
          : json({ data: [entry(2)], nextCursor: 'c2' }),
    });
    vi.stubGlobal('fetch', api.impl);
    const user = userEvent.setup();
    renderApp(<EntityTimeline agencyId="a1" entityType="position" entityId={eid} />);
    await user.click(await screen.findByRole('button', { name: 'Show earlier activity' }));
    expect(await screen.findByText('Person 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show earlier activity' })).toBeNull();
  });

  it('shows an error state', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        'GET /api/v1/agencies/a1/activity': () =>
          json({ error: { code: 'not_found', message: 'x' } }, 404),
      }).impl,
    );
    renderApp(<EntityTimeline agencyId="a1" entityType="position" entityId={eid} />);
    expect((await screen.findByRole('alert')).textContent).toBe('Could not load this. Try again.');
  });
});
