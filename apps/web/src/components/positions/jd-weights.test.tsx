// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MATCH_WEIGHTS } from '@easemuse/core';
import { renderApp, stubApi } from '@/test/render';
import { JdPanel } from './jd-panel';
import { WeightsEditor } from './weights-editor';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const jdPath = '/api/v1/agencies/a1/positions/p1/jd';
const jd = (over: Record<string, unknown> = {}) => ({
  id: 'j1',
  fileId: 'f1',
  filename: 'client-jd.pdf',
  text: 'Senior engineer wanted',
  extractionStatus: 'ready',
  extractionMethod: 'pdf_text',
  extractionError: null,
  parsedFromImage: false,
  createdAt: '2026-10-05T00:00:00.000Z',
  ...over,
});

describe('JdPanel', () => {
  it('lists originals with a download link and the text', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${jdPath}`]: () => json({ data: [jd()] }) }).impl);
    renderApp(<JdPanel agencyId="a1" positionId="p1" canEdit />);
    expect(await screen.findByText('client-jd.pdf')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download original' }).getAttribute('href')).toBe(
      '/api/v1/agencies/a1/files/f1',
    );
    expect(screen.getByText('Senior engineer wanted')).toBeTruthy();
  });

  it('shows reading, failed and from-image states', async () => {
    vi.stubGlobal(
      'fetch',
      stubApi({
        [`GET ${jdPath}`]: () =>
          json({
            data: [
              jd({ id: 'a', extractionStatus: 'pending', text: null }),
              jd({
                id: 'b',
                extractionStatus: 'failed',
                text: null,
                extractionError: 'The file is empty.',
              }),
              jd({ id: 'c', parsedFromImage: true }),
            ],
          }),
      }).impl,
    );
    renderApp(<JdPanel agencyId="a1" positionId="p1" canEdit />);
    expect(await screen.findByText('Reading the file…')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('The file is empty.');
    expect(screen.getByText(/read from page images/)).toBeTruthy();
  });

  it('uploads a file as multipart', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const stub = stubApi({ [`GET ${jdPath}`]: () => json({ data: [] }) });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        calls.push({ url: String(input), body: init.body });
        return json({ data: jd() }, 201);
      }
      return stub.impl(input, init);
    });
    const user = userEvent.setup();
    renderApp(<JdPanel agencyId="a1" positionId="p1" canEdit />);
    await user.upload(
      await screen.findByLabelText(/Upload file/),
      new File(['hello jd'], 'jd.txt', { type: 'text/plain' }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toBeInstanceOf(FormData);
    expect((calls[0]!.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('saves pasted text only when it is long enough', async () => {
    const stub = stubApi({
      [`GET ${jdPath}`]: () => json({ data: [] }),
      [`POST ${jdPath}`]: () => json({ data: jd() }, 201),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    renderApp(<JdPanel agencyId="a1" positionId="p1" canEdit />);
    const box = await screen.findByLabelText('Job description text');
    const button = screen.getByRole('button', { name: 'Save pasted text' });
    await user.type(box, 'too short');
    expect(button.matches(':disabled')).toBe(true);
    await user.clear(box);
    await user.type(box, 'x'.repeat(60));
    await user.click(button);
    await waitFor(() => expect(stub.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(stub.calls.find((c) => c.method === 'POST')!.body).toEqual({ text: 'x'.repeat(60) });
  });

  it('explains an unsupported file type', async () => {
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init: RequestInit = {}) =>
      init.method === 'POST'
        ? json({ error: { code: 'unsupported_type', message: 'x' } }, 415)
        : json({ data: [] }),
    );
    // The browser would filter by `accept`; the server check still has to hold, so skip the filter here.
    const user = userEvent.setup({ applyAccept: false });
    renderApp(<JdPanel agencyId="a1" positionId="p1" canEdit />);
    await user.upload(
      await screen.findByLabelText(/Upload file/),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Upload a PDF, DOCX or plain text file.',
    );
  });

  it('shows no upload controls to someone who cannot edit', async () => {
    vi.stubGlobal('fetch', stubApi({ [`GET ${jdPath}`]: () => json({ data: [] }) }).impl);
    renderApp(<JdPanel agencyId="a1" positionId="p1" canEdit={false} />);
    expect(await screen.findByText(/No job description yet/)).toBeTruthy();
    expect(screen.queryByLabelText(/Upload file/)).toBeNull();
  });
});

describe('WeightsEditor', () => {
  const path = '/api/v1/agencies/a1/positions/p1';
  it('shows the position weights with a running total and saves a valid change', async () => {
    const stub = stubApi({ [`PATCH ${path}`]: () => json({ data: {} }) });
    vi.stubGlobal('fetch', stub.impl);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <WeightsEditor
        agencyId="a1"
        positionId="p1"
        weights={DEFAULT_MATCH_WEIGHTS}
        canEdit
        onSaved={onSaved}
      />,
    );
    expect(screen.getByText('Total: 100 of 100')).toBeTruthy();
    const core = screen.getByLabelText('Core competencies');
    await user.clear(core);
    await user.type(core, '35');
    expect(screen.getByText('Total: 95 of 100')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save weights' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The weights must add up to 100 (now 95).',
    );
    expect(stub.calls).toHaveLength(0);
    const relevant = screen.getByLabelText('Relevant experience');
    await user.clear(relevant);
    await user.type(relevant, '25');
    await user.click(screen.getByRole('button', { name: 'Save weights' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(stub.calls[0]!.body).toEqual({
      matchingWeights: { ...DEFAULT_MATCH_WEIGHTS, coreCompetencies: 35, relevantExperience: 25 },
    });
  });

  it('is read-only when the person cannot edit', () => {
    renderApp(
      <WeightsEditor
        agencyId="a1"
        positionId="p1"
        weights={DEFAULT_MATCH_WEIGHTS}
        canEdit={false}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Core competencies').matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save weights' })).toBeNull();
  });
});
