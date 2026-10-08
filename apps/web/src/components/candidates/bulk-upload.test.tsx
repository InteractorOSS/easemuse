// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp } from '@/test/render';
import { BULK_MAX_FILES, BulkUpload } from './bulk-upload';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const pdf = (name: string, size = 1000) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });

const candidateView = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'draft',
  profileArtifactId: 'art1',
  documents: [{ extractionStatus: 'ready' }],
  ...over,
});

describe('BulkUpload (T-2-14, FR-SRC-10)', () => {
  it('sends each file with the chosen source, skips what cannot be read, and links to the review', async () => {
    const posts: { source: FormDataEntryValue | null; name: string }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      if (init.method === 'POST' && url.pathname.endsWith('/candidates/intake')) {
        const form = init.body as FormData;
        const file = form.get('file') as File;
        posts.push({ source: form.get('source'), name: file.name });
        const id = file.name === 'a.pdf' ? 'c1' : 'c2';
        return json({ data: { candidateId: id, jobRunId: `j-${id}` } }, 202);
      }
      const match = url.pathname.match(/\/candidates\/(c\d)$/);
      if (match) {
        return json({
          data:
            match[1] === 'c1'
              ? candidateView('c1')
              : candidateView('c2', {
                  profileArtifactId: null,
                  documents: [{ extractionStatus: 'pending' }],
                }),
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderApp(<BulkUpload agencyId="a1" agencySlug="acme" />);
    await user.selectOptions(screen.getByLabelText('Where did they come from?'), 'referral');
    await user.upload(screen.getByLabelText(/Resume files/), [
      pdf('a.pdf'),
      pdf('b.pdf'),
      new File(['x'], 'notes.png', { type: 'image/png' }),
      pdf('huge.pdf', 10 * 1024 * 1024 + 1),
    ]);
    await user.click(screen.getByRole('button', { name: 'Upload 4 files' }));

    expect(await screen.findByText('Uploaded 2 of 4.')).toBeTruthy();
    expect(posts.map((p) => p.name).sort()).toEqual(['a.pdf', 'b.pdf']);
    expect(posts.every((p) => p.source === 'referral')).toBe(true);
    const rows = screen.getAllByRole('row');
    const row = (name: string) => rows.find((r) => within(r).queryByText(name))!;
    expect(await within(row('a.pdf')).findByText('Ready to review')).toBeTruthy();
    expect(
      within(row('a.pdf')).getByRole('link', { name: 'Review a.pdf' }).getAttribute('href'),
    ).toBe('/a/acme/candidates/c1/review');
    expect(await within(row('b.pdf')).findByText('Reading the file')).toBeTruthy();
    expect(within(row('notes.png')).getByText(/Not a PDF, DOCX or text file/)).toBeTruthy();
    expect(within(row('huge.pdf')).getByText(/More than 10 MB/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('keeps the first 20 files and says so', async () => {
    const user = userEvent.setup();
    renderApp(<BulkUpload agencyId="a1" agencySlug="acme" />);
    const many = Array.from({ length: BULK_MAX_FILES + 3 }, (_, i) => pdf(`f${i}.pdf`));
    await user.upload(screen.getByLabelText(/Resume files/), many);
    expect(screen.getByText(/Choose at most 20 files at a time/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload 20 files' })).toBeTruthy();
  });

  it('does nothing until a file is chosen', () => {
    renderApp(<BulkUpload agencyId="a1" agencySlug="acme" />);
    expect(
      (screen.getByRole('button', { name: 'Upload 0 files' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows a failed upload as not uploaded, without stopping the others', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      if (init.method === 'POST') {
        const name = ((init.body as FormData).get('file') as File).name;
        return name === 'bad.pdf'
          ? json({ error: { code: 'unknown_error', message: 'x' } }, 500)
          : json({ data: { candidateId: 'c1', jobRunId: 'j' } }, 202);
      }
      void url;
      return json({ data: candidateView('c1') });
    });
    const user = userEvent.setup();
    renderApp(<BulkUpload agencyId="a1" agencySlug="acme" />);
    await user.upload(screen.getByLabelText(/Resume files/), [pdf('bad.pdf'), pdf('ok.pdf')]);
    await user.click(screen.getByRole('button', { name: 'Upload 2 files' }));
    await waitFor(() => expect(screen.getByText('Uploaded 1 of 2.')).toBeTruthy());
    expect(screen.getByText(/Something went wrong/)).toBeTruthy();
  });
});
