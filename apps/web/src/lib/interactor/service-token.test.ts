// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { createServiceTokenSource, ServiceTokenError } from './service-token';

const ok = (token = 't1', expires_in = 900) =>
  new Response(JSON.stringify({ access_token: token, expires_in }), { status: 200 });

function setup(responses: (Response | Error)[], clock = { t: 0 }) {
  const queue = [...responses];
  const fetch = vi.fn(async () => {
    const next = queue.shift()!;
    if (next instanceof Error) throw next;
    return next;
  });
  const source = createServiceTokenSource({
    clientId: 'id',
    clientSecret: 'secret',
    baseUrl: () => 'https://auth.test',
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock.t,
    sleep: async () => undefined,
  });
  return { source, fetch, clock };
}

describe('service token source', () => {
  it('mints with client_credentials and caches until near expiry', async () => {
    const { source, fetch, clock } = setup([ok('a'), ok('b')]);
    expect(await source.getToken()).toBe('a');
    expect(await source.getToken()).toBe('a');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://auth.test/oauth/token');
    expect(String(init.body)).toContain('grant_type=client_credentials');
    clock.t = (900 - 30) * 1000; // inside the 60 s refresh margin
    expect(await source.getToken()).toBe('b');
  });

  it('shares one mint between concurrent callers', async () => {
    const { source, fetch } = setup([ok('a')]);
    const tokens = await Promise.all([source.getToken(), source.getToken(), source.getToken()]);
    expect(tokens).toEqual(['a', 'a', 'a']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries once on a transient failure', async () => {
    const { source, fetch } = setup([new Response('', { status: 503 }), ok('a')]);
    expect(await source.getToken()).toBe('a');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry bad credentials and marks them non-transient', async () => {
    const { source, fetch } = setup([new Response('{"client":"id"}', { status: 401 })]);
    const error = (await source.getToken().catch((e) => e)) as ServiceTokenError;
    expect(error).toBeInstanceOf(ServiceTokenError);
    expect(error.transient).toBe(false);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain('client');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats network errors as transient and gives up after the second attempt', async () => {
    const { source } = setup([new Error('ECONNRESET'), new Error('ECONNRESET')]);
    const error = (await source.getToken().catch((e) => e)) as ServiceTokenError;
    expect(error.transient).toBe(true);
  });

  it('fails clearly when credentials are not configured', async () => {
    const source = createServiceTokenSource({
      clientId: undefined,
      clientSecret: undefined,
      baseUrl: () => 'x',
    });
    await expect(source.getToken()).rejects.toThrow(/INTERACTOR_AUTH_CLIENT_ID/);
  });

  it('mints again after invalidate()', async () => {
    const { source, fetch } = setup([ok('a'), ok('b')]);
    await source.getToken();
    source.invalidate();
    expect(await source.getToken()).toBe('b');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
