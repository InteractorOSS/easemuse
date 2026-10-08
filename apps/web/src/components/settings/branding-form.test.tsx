// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { renderApp } from '@/test/render';
import { BrandingForm } from './branding-form';

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => Response.json(body, { status });
const path = '/api/v1/agencies/a1/branding';
const view = (over: Record<string, unknown> = {}) => ({
  data: {
    agencyName: 'Acme Talent',
    displayName: null,
    primaryColor: '#1f2937',
    logoFileId: null,
    ...over,
  },
});

/** A fetch stub that records every call, including multipart ones. */
function serve(routes: Record<string, (init: RequestInit) => Response>) {
  const calls: { method: string; path: string; init: RequestInit }[] = [];
  const impl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    calls.push({ method: init.method ?? 'GET', path: url.pathname, init });
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(init);
  };
  vi.stubGlobal('fetch', impl);
  return calls;
}

describe('BrandingForm (T-13-06)', () => {
  it('shows the current name, colour and no logo, and saves a change', async () => {
    const calls = serve({
      [`GET ${path}`]: () => json(view()),
      [`PATCH ${path}`]: () => json(view({ displayName: 'Acme Search' })),
    });
    renderApp(<BrandingForm agencyId="a1" agencySlug="acme" canEdit />);
    const name = (await screen.findByLabelText(
      'Name shown to clients and candidates',
    )) as HTMLInputElement;
    expect(name.value).toBe('');
    expect((screen.getByLabelText('Colour') as HTMLInputElement).value).toBe('#1f2937');
    expect(screen.getByText('No logo yet.')).toBeTruthy();

    await userEvent.type(name, 'Acme Search');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.method === 'PATCH')!.init.body))).toEqual({
      displayName: 'Acme Search',
      primaryColor: '#1f2937',
    });
  });

  it('refuses a colour too light to read, without calling the server', async () => {
    const calls = serve({ [`GET ${path}`]: () => json(view()) });
    renderApp(<BrandingForm agencyId="a1" agencySlug="acme" canEdit />);
    const colour = await screen.findByLabelText('Colour');
    await userEvent.clear(colour);
    await userEvent.type(colour, '#ffff00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/dark enough to read on white/, { selector: '[role=alert]' }),
    ).toBeTruthy();
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it('uploads a logo as multipart and refuses a wrong type before sending', async () => {
    const calls = serve({
      [`GET ${path}`]: () => json(view()),
      [`PUT ${path}/logo`]: () => json(view({ logoFileId: 'f1' })),
    });
    renderApp(<BrandingForm agencyId="a1" agencySlug="acme" canEdit />);
    const input = (await screen.findByLabelText('Choose a logo file')) as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] },
    });
    expect(await screen.findByText('Upload a PNG or JPEG image.')).toBeTruthy();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);

    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')!.init.body).toBeInstanceOf(FormData);
  });

  it('shows the logo with the public address and lets an admin remove it', async () => {
    const calls = serve({
      [`GET ${path}`]: () => json(view({ logoFileId: 'f1' })),
      [`DELETE ${path}/logo`]: () => json(view()),
    });
    renderApp(<BrandingForm agencyId="a1" agencySlug="acme" canEdit />);
    const img = (await screen.findByRole('img', { name: 'Acme Talent logo' })) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/public/agencies/acme/logo?v=f1');
    await userEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  it('is read-only without edit rights, and passes axe', async () => {
    serve({ [`GET ${path}`]: () => json(view({ logoFileId: 'f1', displayName: 'Acme Search' })) });
    const { container } = renderApp(
      <BrandingForm agencyId="a1" agencySlug="acme" canEdit={false} />,
    );
    await screen.findByText('Only an admin can change these.');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect((screen.getByLabelText('Colour') as HTMLInputElement).disabled).toBe(true);
    await expectNoA11yViolations(container);
  });
});
