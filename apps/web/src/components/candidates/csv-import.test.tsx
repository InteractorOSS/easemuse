// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp, stubApi } from '@/test/render';
import { CsvImport } from './csv-import';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const api = '/api/v1/agencies/a1/candidates/import';
const csv = (text: string) => new File([text], 'export.csv', { type: 'text/csv' });
const view = () => renderApp(<CsvImport agencyId="a1" agencySlug="acme" />);

describe('CsvImport (T-2-15, Q-10)', () => {
  it('guesses the columns, lets the recruiter change them, and sends the mapped rows', async () => {
    const stub = stubApi({
      [`POST ${api}`]: () =>
        json({
          data: [
            { index: 0, status: 'created', candidateId: 'c1' },
            { index: 1, status: 'duplicate', candidateId: 'c9', reasons: ['email'] },
          ],
        }),
    });
    vi.stubGlobal('fetch', stub.impl);
    const user = userEvent.setup();
    const { container } = view();
    await user.selectOptions(screen.getByLabelText('Where did they come from?'), 'referral');
    await user.upload(
      screen.getByLabelText(/CSV file/),
      csv(
        'First Name,Last Name,E-mail,Employer,Skills\nAlex,Kim,alex@x.com,Northwind,"payroll, tax"\nPat,Lee,pat@x.com,Acme,\n,,nobody@x.com,Acme,\n',
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Which column is which' })).toBeTruthy();
    // Guessed from the headings.
    expect((screen.getByLabelText('First Name') as HTMLSelectElement).value).toBe('firstName');
    expect((screen.getByLabelText('E-mail') as HTMLSelectElement).value).toBe('email');
    // "Employer" is recognised as the company; the recruiter can still change it.
    expect((screen.getByLabelText('Employer') as HTMLSelectElement).value).toBe('currentCompany');
    await user.selectOptions(screen.getByLabelText('Employer'), 'location');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Import 3 rows' }));
    expect(
      await screen.findByText(/Finished: 1 added, 1 already in the agency, 1 skipped/),
    ).toBeTruthy();
    const body = stub.calls.find((c) => c.method === 'POST')!.body as {
      source: string;
      rows: Record<string, unknown>[];
    };
    expect(body.source).toBe('referral');
    // The nameless row never leaves the browser.
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]).toMatchObject({
      fullName: 'Alex Kim',
      email: 'alex@x.com',
      location: 'Northwind',
      skills: ['payroll', 'tax'],
    });
    expect(
      screen.getByText(/Row 3: Pat Lee is the same as an existing candidate \(same email\)/),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(
      '/a/acme/candidates/c9',
    );
    expect(screen.getByText('Row 4: no name')).toBeTruthy();
  });

  it('will not import without a name column', async () => {
    vi.stubGlobal('fetch', stubApi({}).impl);
    const user = userEvent.setup();
    view();
    await user.upload(screen.getByLabelText(/CSV file/), csv('Email,Phone\na@x.com,0101111222\n'));
    expect(await screen.findByText(/Choose a column for the name/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Import/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('sends rows in batches of 100 and reports how far it got when a request fails', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      calls++;
      const rows = (JSON.parse(String(init.body)) as { rows: unknown[] }).rows;
      if (calls === 2) return json({ error: { code: 'unknown_error', message: 'x' } }, 500);
      return json({
        data: rows.map((_, index) => ({
          index,
          status: 'created',
          candidateId: `c${calls}-${index}`,
        })),
      });
    });
    const user = userEvent.setup();
    view();
    const lines = Array.from({ length: 250 }, (_, i) => `Person ${i},p${i}@x.com`);
    await user.upload(screen.getByLabelText(/CSV file/), csv(`Name,Email\n${lines.join('\n')}\n`));
    await user.click(await screen.findByRole('button', { name: 'Import 250 rows' }));
    await waitFor(() => expect(screen.getByText(/Finished: 100 added/)).toBeTruthy());
    expect(calls).toBe(2);
    expect(within(screen.getByRole('alert')).getByText(/150 rows were not sent/)).toBeTruthy();
  });

  it('refuses a file that cannot be a candidate list', async () => {
    const user = userEvent.setup();
    view();
    await user.upload(screen.getByLabelText(/CSV file/), csv('Name,Email\n'));
    expect(await screen.findByText('The file has no rows.')).toBeTruthy();
  });
});
