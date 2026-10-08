// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAgencySettings } from '@easemuse/core';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { ConfigView } from './config-view';
import { FeatureFlagsPanel } from './feature-flags-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown) => Response.json(body);
const config = {
  routing: [
    {
      purpose: 'jd.structure',
      code: 'A1',
      model: 'claude-opus-5-5',
      effort: 'medium',
      artifactKind: 'structured_jd',
      maxTokens: 16000,
      promptVersion: 'jd-structure-v3',
    },
    {
      purpose: 'pool.similar',
      code: 'A8',
      model: 'claude-sonnet-5-5',
      effort: 'low',
      artifactKind: 'similar_candidates',
      maxTokens: 8000,
      promptVersion: null,
    },
  ],
  flags: [
    { key: 'portals', default: true },
    { key: 'email_sending', default: true },
  ],
};
const defaultsPath = '/api/admin/v1/config/new-agency-defaults';

describe('ConfigView (T-16-02, FR-ADM-10)', () => {
  const serve = () =>
    stubApi({
      'GET /api/admin/v1/config': () => json({ data: config }),
      [`GET ${defaultsPath}`]: () => json({ data: parseAgencySettings({}) }),
      [`PATCH ${defaultsPath}`]: () => json({ data: parseAgencySettings({}) }),
    });

  it('shows the routing table with prompt versions, the flags, and the defaults form', async () => {
    vi.stubGlobal('fetch', serve().impl);
    const { container } = renderApp(<ConfigView canWrite />);
    const table = await screen.findByRole('table', { name: 'AI routing and prompt versions' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]!.textContent).toContain('claude-opus-5-5');
    expect(rows[1]!.textContent).toContain('jd-structure-v3');
    expect(rows[2]!.textContent).toContain('Not built yet');
    expect(screen.getByText('Portals')).toBeTruthy();
    expect(await screen.findByLabelText('Core competencies')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Settings new agencies start from' })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('saves the defaults to the platform endpoint', async () => {
    const api = serve();
    vi.stubGlobal('fetch', api.impl);
    renderApp(<ConfigView canWrite />);
    await userEvent.click(await screen.findByRole('button', { name: 'Save defaults' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
  });

  it('is read only without write rights', async () => {
    vi.stubGlobal('fetch', serve().impl);
    renderApp(<ConfigView canWrite={false} />);
    expect(await screen.findByText('Only an admin can change these.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save defaults' })).toBeNull();
  });
});

describe('FeatureFlagsPanel', () => {
  const path = '/api/admin/v1/agencies/a1/features';
  it('shows each flag and switches one off', async () => {
    const api = stubApi({
      [`GET ${path}`]: () =>
        json({ data: { agencyId: 'a1', flags: { portals: true, email_sending: true } } }),
      [`PUT ${path}`]: () =>
        json({ data: { agencyId: 'a1', flags: { portals: false, email_sending: true } } }),
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<FeatureFlagsPanel agencyId="a1" canWrite />);
    const portals = await screen.findByRole('checkbox', { name: /Portals/ });
    expect((portals as HTMLInputElement).checked).toBe(true);
    await userEvent.click(portals);
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'PUT')?.body).toEqual({
        flag: 'portals',
        enabled: false,
      }),
    );
  });

  it('cannot be changed without write rights', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () =>
          json({ data: { agencyId: 'a1', flags: { portals: false, email_sending: true } } }),
      }).impl,
    );
    renderApp(<FeatureFlagsPanel agencyId="a1" canWrite={false} />);
    const portals = await screen.findByRole('checkbox', { name: /Portals/ });
    expect((portals as HTMLInputElement).disabled).toBe(true);
    expect((portals as HTMLInputElement).checked).toBe(false);
  });
});
