// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/render';
import { PositionIntake } from './position-intake';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const drafts = '/api/v1/agencies/a1/positions/p1/intake-drafts';
const intake = '/api/v1/agencies/a1/candidates/intake';
const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

/** Fetch stub that also takes the multipart upload (the shared stubApi reads bodies as JSON). */
function serve(
  list: () => unknown[],
  upload: (form: FormData) => Response = () => json({ data: { candidateId: 'c9' } }, 202),
) {
  const uploads: FormData[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      if (path === drafts && (init.method ?? 'GET') === 'GET') return json({ data: list() });
      if (path === intake && init.method === 'POST') {
        uploads.push(init.body as FormData);
        return upload(init.body as FormData);
      }
      throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${path}`);
    }),
  );
  return uploads;
}
const view = () =>
  renderApp(<PositionIntake agencyId="a1" agencySlug="acme" positionId="p1" />);

describe('PositionIntake (G#9)', () => {
  it('uploads the chosen files for this position, with each profile link', async () => {
    let uploaded = false;
    const uploads = serve(() =>
      uploaded
        ? [
            {
              candidateId: 'c9',
              filename: 'alex.pdf',
              createdAt: '2026-10-13T00:00:00.000Z',
              state: 'ready',
            },
          ]
        : [],
    );
    const user = userEvent.setup();
    view();
    expect(await screen.findByText('No uploaded resume is waiting for review.')).toBeTruthy();
    await user.upload(screen.getByLabelText('Files'), [pdf('alex.pdf'), pdf('kim.pdf')]);
    await user.type(
      screen.getByLabelText('Profile link for alex.pdf (optional)'),
      'https://www.linkedin.com/in/alex',
    );
    uploaded = true;
    await user.click(screen.getByRole('button', { name: 'Upload 2 files' }));
    await waitFor(() => expect(uploads).toHaveLength(2));
    const alex = uploads.find((f) => (f.get('file') as File).name === 'alex.pdf')!;
    expect(alex.get('positionId')).toBe('p1');
    expect(alex.get('source')).toBe('linkedin');
    expect(alex.get('profileUrl')).toBe('https://www.linkedin.com/in/alex');
    const kim = uploads.find((f) => (f.get('file') as File).name === 'kim.pdf')!;
    expect(kim.get('profileUrl')).toBeNull();

    const row = (await screen.findByRole('rowheader', { name: 'alex.pdf' })).closest('tr')!;
    expect(within(row).getByText('Ready to review')).toBeTruthy();
    expect(
      within(row).getByRole('link', { name: 'Review alex.pdf' }).getAttribute('href'),
    ).toBe('/a/acme/candidates/c9/review');
  });

  it('keeps at most 10 files and says so', async () => {
    serve(() => []);
    const user = userEvent.setup();
    view();
    const files = Array.from({ length: 12 }, (_, i) => pdf(`cv-${i}.pdf`));
    await user.upload(await screen.findByLabelText('Files'), files);
    expect(screen.getByText('Only the first 10 files are kept.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload 10 files' })).toBeTruthy();
  });

  it('says why a file was refused', async () => {
    serve(
      () => [],
      () => json({ error: { code: 'conflict', message: 'This position is closed' } }, 409),
    );
    const user = userEvent.setup();
    view();
    await user.upload(await screen.findByLabelText('Files'), [pdf('alex.pdf')]);
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    expect(await screen.findByText('This position is closed.')).toBeTruthy();
  });

  it('shows drafts still being read without a review link', async () => {
    serve(() => [
      {
        candidateId: 'c1',
        filename: 'new.pdf',
        createdAt: '2026-10-13T00:00:00.000Z',
        state: 'reading',
      },
    ]);
    view();
    const row = (await screen.findByRole('rowheader', { name: 'new.pdf' })).closest('tr')!;
    expect(within(row).getByText('Reading the file…')).toBeTruthy();
    expect(within(row).queryByRole('link')).toBeNull();
  });
});
