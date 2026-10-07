// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ApiDataBody, ApiErrorBody } from '@easemuse/core';

/** An error answer from our API, with its machine-readable code and per-field messages. */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly guards: NonNullable<ApiErrorBody['error']['guards']> = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Calls our own API from the browser. Resolves to the parsed `{ data, nextCursor }` body, or throws
 * `ApiClientError` for any error answer (and for a network failure, with status 0).
 */
export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiDataBody<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiClientError(0, 'network_error', 'Network error');
  }
  if (response.status === 204) return { data: undefined as T };
  const body = (await response.json().catch(() => null)) as
    (ApiDataBody<T> & Partial<ApiErrorBody>) | null;
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? 'unknown_error',
      body?.error?.message ?? response.statusText,
      body?.error?.fields,
      body?.error?.guards,
    );
  }
  return body as ApiDataBody<T>;
}
