// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { DataExport } from './data-export';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const path = '/api/v1/agencies/a1/data-export';
const item = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  status,
  createdAt: '2026-10-07T09:00:00.000Z',
  completedAt: null,
  sizeBytes: null,
  tableCounts: null,
  error: null,
  jobRunId: null,
  ...over,
});

describe('DataExport (T-13-09, FR-TEN-06)', () => {
  it('starts an export, and cannot start another while one is being prepared', async () => {
    let list = [item('e0', 'completed', { sizeBytes: 3_145_728 })];
    const api = stubApi({
      [`GET ${path}`]: () => json({ data: list }),
      [`POST ${path}`]: () => {
        list = [item('e1', 'queued'), ...list];
        return json({ data: list[0] }, 202);
      },
    });
    vi.stubGlobal('fetch', api.impl);
    renderApp(<DataExport agencyId="a1" />);
    const link = await screen.findByRole('link', { name: 'Download the ZIP' });
    expect(link.getAttribute('href')).toBe(`${path}/e0/download`);
    expect(screen.getByText('3 MB')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Create a new export' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Create a new export' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect(await screen.findByText('Waiting')).toBeTruthy();
  });

  it('says when an export failed or was too large, and passes axe', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () =>
          json({
            data: [
              item('e2', 'failed', { error: 'export_too_large' }),
              item('e1', 'failed', { error: 'export_failed' }),
            ],
          }),
      }).impl,
    );
    const { container } = renderApp(<DataExport agencyId="a1" />);
    expect(await screen.findByText(/too much data for one export/)).toBeTruthy();
    expect(screen.getByText(/could not be made/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('says so when there are no exports', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${path}`]: () => json({ data: [] }) }).impl);
    renderApp(<DataExport agencyId="a1" />);
    expect(await screen.findByText('No exports yet.')).toBeTruthy();
  });
});
