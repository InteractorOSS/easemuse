// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { CredentialsError, createCredentialsClient } from './credentials';

const client = (fetchImpl: typeof fetch) =>
  createCredentialsClient({
    baseUrl: () => 'https://core.example.test',
    token: async () => 'svc-token',
    fetch: fetchImpl,
  });
const ok = (data: unknown) => Response.json({ data });

describe('Interactor credentials client (ADR-014)', () => {
  it('starts an OAuth flow with the person, service and scopes, and maps the answer', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ flow_id: 'f1', authorization_url: 'https://accounts.example/auth' }),
    );
    const result = await client(fetchImpl as never).initiateOAuth({
      serviceId: 'gmail',
      externalUserId: 'easemuse:a1:u1',
      scopes: ['s1'],
      successRedirectUrl: 'https://app.test/back',
    });
    expect(result).toEqual({ flowId: 'f1', authorizationUrl: 'https://accounts.example/auth' });
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://core.example.test/api/v1/oauth/initiate');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer svc-token');
    expect(JSON.parse(String(init.body))).toEqual({
      service_id: 'gmail',
      external_user_id: 'easemuse:a1:u1',
      scopes: ['s1'],
      success_redirect_url: 'https://app.test/back',
    });
  });

  it('reads a credential and its access token', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/token')
        ? ok({ access_token: 'ya29.x' })
        : ok({
            id: 'c1',
            external_user_id: 'easemuse:a1:u1',
            service_id: 'gmail',
            status: 'active',
            scopes: ['s'],
          }),
    );
    const api = client(fetchImpl as never);
    expect(await api.getCredential('c1')).toEqual({
      id: 'c1',
      externalUserId: 'easemuse:a1:u1',
      serviceId: 'gmail',
      status: 'active',
      scopes: ['s'],
    });
    expect(await api.getAccessToken('c/1')).toBe('ya29.x');
    expect(String(fetchImpl.mock.calls[1]![0])).toBe(
      'https://core.example.test/api/v1/credentials/c%2F1/token',
    );
  });

  it('deletes a credential (204) and classifies failures without echoing the body', async () => {
    expect(
      await client((async () => new Response(null, { status: 204 })) as never).deleteCredential(
        'c1',
      ),
    ).toBeUndefined();
    const failing = (status: number) =>
      client((async () => new Response('secret detail', { status })) as never)
        .getAccessToken('c1')
        .catch((e: CredentialsError) => e);
    const gone = (await failing(404)) as CredentialsError;
    expect(gone).toMatchObject({ status: 404, transient: false });
    expect(gone.message).not.toContain('secret');
    expect(await failing(503)).toMatchObject({ status: 503, transient: true });
    expect(await failing(429)).toMatchObject({ transient: true });
    const network = (await client((async () => {
      throw new Error('ECONNRESET');
    }) as never)
      .getAccessToken('c1')
      .catch((e: CredentialsError) => e)) as CredentialsError;
    expect(network).toMatchObject({ transient: true, status: null });
  });
});
