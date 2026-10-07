// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, stubApi } from '@/test/render';
import { JdExportPanel } from './jd-export-panel';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const path = '/api/v1/agencies/a1/positions/p1/jd/export';
const status = (document: unknown) => json({ data: { versionId: 'v1', document } });

describe('JdExportPanel', () => {
  it('offers both formats and no PDF link before one exists', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${path}`]: () => status(null) }).impl);
    renderApp(<JdExportPanel agencyId="a1" positionId="p1" />);
    expect(await screen.findByRole('button', { name: 'Download Word file' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create PDF' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Download PDF' })).toBeNull();
  });

  it('links the existing PDF through the authorized file route', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () =>
          status({ fileId: 'f1', createdAt: '2026-10-07T00:00:00.000Z', upToDate: true }),
      }).impl,
    );
    renderApp(<JdExportPanel agencyId="a1" positionId="p1" />);
    expect((await screen.findByRole('link', { name: 'Download PDF' })).getAttribute('href')).toBe(
      '/api/v1/agencies/a1/files/f1',
    );
    expect(screen.getByRole('button', { name: 'Create PDF again' })).toBeTruthy();
    expect(screen.queryByText(/older than the approved JD/)).toBeNull();
  });

  it('warns when the PDF no longer matches the approved JD or branding', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${path}`]: () =>
          status({ fileId: 'f1', createdAt: '2026-10-07T00:00:00.000Z', upToDate: false }),
      }).impl,
    );
    renderApp(<JdExportPanel agencyId="a1" positionId="p1" />);
    expect(await screen.findByText(/older than the approved JD/)).toBeTruthy();
  });

  it('asks for a PDF and shows progress until it is ready', async () => {
    let ready = false;
    const stub = stubApi({
      [`GET ${path}`]: () =>
        status(
          ready ? { fileId: 'f2', createdAt: '2026-10-07T00:00:00.000Z', upToDate: true } : null,
        ),
      [`POST ${path}`]: () => json({ data: { jobRunId: 'run1' } }, 202),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<JdExportPanel agencyId="a1" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));
    expect(await screen.findByText('Creating the PDF…')).toBeTruthy();
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ format: 'pdf' });
    ready = true;
    expect(
      await screen.findByRole('link', { name: 'Download PDF' }, { timeout: 5000 }),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Creating the PDF…')).toBeNull());
  });

  it('downloads the Word file', async () => {
    const created: string[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: (b: Blob) => (created.push(String(b.size)), 'blob:x'),
        revokeObjectURL: () => undefined,
      }),
    );
    const clicks = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const stub = stubApi({ [`GET ${path}`]: () => status(null) });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) =>
      init.method === 'POST' ? new Response('docx-bytes', { status: 200 }) : stub.impl(input, init),
    );
    const user = userEvent.setup();
    renderApp(<JdExportPanel agencyId="a1" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Download Word file' }));
    await waitFor(() => expect(clicks).toHaveBeenCalled());
    expect(created).toEqual(['10']);
    clicks.mockRestore();
  });

  it('says to approve the JD first when the server refuses', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (init.method === 'POST') return json({ error: { code: 'conflict', message: 'x' } }, 409);
      return status(null);
    });
    const user = userEvent.setup();
    renderApp(<JdExportPanel agencyId="a1" positionId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Create PDF' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Approve the structured JD first.');
  });
});
