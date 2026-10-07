// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiFetch } from './api-client';

afterEach(() => vi.unstubAllGlobals());
const stub = (response: Response | Error) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  );

describe('apiFetch', () => {
  it('returns data and the next cursor', async () => {
    stub(Response.json({ data: [1], nextCursor: 'c' }));
    expect(await apiFetch('/api/x')).toEqual({ data: [1], nextCursor: 'c' });
  });

  it('sends JSON bodies with POST by default', async () => {
    stub(Response.json({ data: {} }, { status: 201 }));
    await apiFetch('/api/x', { body: { a: 1 } });
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('throws ApiClientError with the code and field messages', async () => {
    stub(
      Response.json(
        { error: { code: 'invalid_input', message: 'Invalid input', fields: { slug: 'Taken' } } },
        { status: 422 },
      ),
    );
    const error = (await apiFetch('/api/x').catch((e) => e)) as ApiClientError;
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 422, code: 'invalid_input', fields: { slug: 'Taken' } });
  });

  it('handles 204 and non-JSON error bodies and network failures', async () => {
    stub(new Response(null, { status: 204 }));
    expect((await apiFetch('/api/x', { method: 'DELETE' })).data).toBeUndefined();
    stub(new Response('<html>', { status: 502 }));
    expect(await apiFetch('/api/x').catch((e) => e)).toMatchObject({
      status: 502,
      code: 'unknown_error',
    });
    stub(new TypeError('failed to fetch'));
    expect(await apiFetch('/api/x').catch((e) => e)).toMatchObject({
      status: 0,
      code: 'network_error',
    });
  });
});
