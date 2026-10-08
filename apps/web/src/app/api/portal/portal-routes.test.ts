// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signPortalSession, PORTAL_COOKIE } from '@/server/portal/session';

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  agency: { id: 'a1', slug: 'acme', name: 'Acme', status: 'active' } as {
    id: string;
    slug: string;
    name: string;
    status: string;
  } | null,
  user: {
    id: 'p1',
    email: 'x@y.test',
    audience: 'hiring_manager',
    candidateId: null,
    clientContactId: 'c1',
    disabledAt: null,
  } as Record<string, unknown> | null,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'em_portal' && state.cookie ? { value: state.cookie } : undefined,
  }),
}));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ AUTH_SECRET: 'portal-routes-secret-0123456789abcdef' }),
}));
vi.mock('@/lib/db', () => ({
  getAgencyByRef: async () => state.agency,
  withAgency: async (_id: string, fn: (tx: unknown) => unknown) =>
    fn({
      portalUser: { findUnique: async () => state.user },
      portalShare: { findMany: async () => [] },
    }),
}));

import { GET as listGet } from './v1/[agencySlug]/shares/route';

const SECRET = 'portal-routes-secret-0123456789abcdef';
const params = { params: Promise.resolve({ agencySlug: 'acme' }) };
const session = (over: Record<string, string> = {}) =>
  signPortalSession(SECRET, {
    portalUserId: 'p1',
    agencyId: 'a1',
    audience: 'hiring_manager',
    ...over,
  } as never);

describe('portal route authorization', () => {
  beforeEach(() => {
    state.cookie = undefined;
    state.agency = { id: 'a1', slug: 'acme', name: 'Acme', status: 'active' };
    state.user = {
      id: 'p1',
      email: 'x@y.test',
      audience: 'hiring_manager',
      candidateId: null,
      clientContactId: 'c1',
      disabledAt: null,
    };
  });
  const status = async () => (await listGet(new Request('http://x.test/'), params)).status;

  it('answers 401 without a session cookie', async () => {
    expect(await status()).toBe(401);
  });

  it('answers 200 with a valid session for this agency', async () => {
    state.cookie = session();
    expect(await status()).toBe(200);
    void PORTAL_COOKIE;
  });

  it('answers 404 for a session of another agency, and 404 for an agency that does not exist', async () => {
    state.cookie = session({ agencyId: 'someone-else' });
    expect(await status()).toBe(404);
    state.cookie = session();
    state.agency = null;
    expect(await status()).toBe(404);
  });

  it('answers 404 once the agency is suspended and 401 once the person is turned off', async () => {
    state.cookie = session();
    state.agency = { id: 'a1', slug: 'acme', name: 'Acme', status: 'suspended' };
    expect(await status()).toBe(404);
    state.agency = { id: 'a1', slug: 'acme', name: 'Acme', status: 'active' };
    state.user = { ...state.user!, disabledAt: new Date() };
    expect(await status()).toBe(401);
  });

  it('refuses a cookie that was tampered with or signed with another secret', async () => {
    state.cookie = `${session().split('.')[0]}.AAAA`;
    expect(await status()).toBe(401);
    state.cookie = signPortalSession('another-secret-another-secret-0123', {
      portalUserId: 'p1',
      agencyId: 'a1',
      audience: 'hiring_manager',
    });
    expect(await status()).toBe(401);
  });
});
