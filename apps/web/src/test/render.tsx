// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Every English catalog, read from disk, so a new namespace is available to component tests without
 * touching this file (the guard in src/i18n/messages.guard.test.ts keeps NAMESPACES in step).
 */
// @ts-expect-error `import.meta.glob` is provided by Vite when the tests run; Next's types do not declare it.
const catalogs: Record<string, { default: Record<string, unknown> }> = import.meta.glob(
  '../../messages/en/*.json',
  { eager: true },
);
export const messages = Object.fromEntries(
  Object.entries(catalogs).map(([file, module]) => [
    file.split('/').pop()!.replace('.json', ''),
    module.default,
  ]),
);

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

/** Renders with the English catalogs, as the app does. `rerender` keeps the providers. */
export function renderWithIntl(ui: ReactElement) {
  return render(ui, { wrapper: IntlWrapper });
}

/** Like renderWithIntl, plus a fresh TanStack Query client (no retries) and the toast provider. */
export function renderApp(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  function Providers({ children }: { children: ReactNode }) {
    return (
      <IntlWrapper>
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </IntlWrapper>
    );
  }
  return render(ui, { wrapper: Providers });
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
