// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import common from '../../messages/en/common.json';
import home from '../../messages/en/home.json';
import nav from '../../messages/en/nav.json';
import workbench from '../../messages/en/workbench.json';
import email from '../../messages/en/email.json';
import admin from '../../messages/en/admin.json';
import members from '../../messages/en/members.json';

export const messages = { common, nav, home, workbench, email, admin, members };

/** Renders with the English catalogs, as the app does. */
export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Like renderWithIntl, plus a fresh TanStack Query client (no retries) and the toast provider. */
export function renderApp(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** Stubs fetch with a router keyed by "METHOD /path"; unmatched requests fail the test loudly. */
export function stubApi(routes: Record<string, Handler>) {
  const calls: { method: string; url: URL; body: unknown }[] = [];
  const impl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    return handler(url, init);
  };
  return { impl, calls };
}
