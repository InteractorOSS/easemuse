// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import type { AgencyRef, PlatformUser } from '@/lib/db/platform';
import { createAuthorizers, type AuthDeps } from './authorizers';

const agency: AgencyRef = { id: 'a-1', slug: 'acme', name: 'Acme', status: 'active' };
const user: PlatformUser = {
  id: 'u-1',
  email: 'u@x.test',
  name: 'U',
  platformRole: null,
  locale: null,
};

function setup(overrides: Partial<AuthDeps> = {}) {
  const deps: AuthDeps = {
    getSession: async () => ({ userId: 'u-1', mfa: true }),
    getUser: async () => user,
    getAgency: async (ref) => (ref === 'acme' || ref === 'a-1' ? agency : null),
    loadMembership: async () => ({ role: 'recruiter', active: true }),
    mfaEnforcement: () => 'off',
    log: vi.fn(),
    ...overrides,
  };
  return { deps, auth: createAuthorizers(deps) };
}

async function status(result: unknown): Promise<number | 'ok'> {
  return result instanceof Response ? result.status : 'ok';
}

describe('authorizeAgency', () => {
  it('returns the actor for a member', async () => {
    const { auth } = setup();
    const result = await auth.authorizeAgency('acme');
    expect(result).toMatchObject({
      actor: { kind: 'agency', userId: 'u-1', agencyId: 'a-1', role: 'recruiter' },
    });
  });

  it('accepts the agency by id or slug', async () => {
    const { auth } = setup();
    expect(await status(await auth.authorizeAgency('a-1'))).toBe('ok');
  });

  it('returns 401 without a session', async () => {
    const { auth } = setup({ getSession: async () => null });
    expect(await status(await auth.authorizeAgency('acme'))).toBe(401);
  });

  it('returns 404 for an unknown agency, a non-member and a deactivated member', async () => {
    expect(await status(await setup().auth.authorizeAgency('nope'))).toBe(404);
    const notMember = setup({ loadMembership: async () => null });
    expect(await status(await notMember.auth.authorizeAgency('acme'))).toBe(404);
    const inactive = setup({ loadMembership: async () => ({ role: 'admin', active: false }) });
    expect(await status(await inactive.auth.authorizeAgency('acme'))).toBe(404);
  });

  it('returns 403 for a member with the wrong role, 200 for the right one', async () => {
    const { auth } = setup();
    expect(await status(await auth.authorizeAgency('acme', { roles: ['admin', 'lead'] }))).toBe(
      403,
    );
    expect(await status(await auth.authorizeAgency('acme', { roles: ['recruiter'] }))).toBe('ok');
  });

  it('refuses a suspended agency with a distinct code', async () => {
    const { auth } = setup({ getAgency: async () => ({ ...agency, status: 'suspended' }) });
    const res = (await auth.authorizeAgency('acme')) as Response;
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('agency_suspended');
  });

  it('does not reveal membership: unknown agency and non-member look identical', async () => {
    const a = (await setup().auth.authorizeAgency('nope')) as Response;
    const b = (await setup({ loadMembership: async () => null }).auth.authorizeAgency(
      'acme',
    )) as Response;
    expect(await a.json()).toEqual(await b.json());
  });
});

describe('MFA', () => {
  it('denies without MFA when enforced', async () => {
    const { auth } = setup({
      getSession: async () => ({ userId: 'u-1', mfa: false }),
      mfaEnforcement: () => 'enforce',
    });
    const res = (await auth.authorizeAgency('acme')) as Response;
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('mfa_required');
  });

  it('only logs without MFA in log mode', async () => {
    const { auth, deps } = setup({
      getSession: async () => ({ userId: 'u-1', mfa: false }),
      mfaEnforcement: () => 'log',
    });
    expect(await status(await auth.authorizeAgency('acme'))).toBe('ok');
    expect(deps.log).toHaveBeenCalledWith(
      'mfa.missing',
      expect.objectContaining({ userId: 'u-1' }),
    );
  });
});

describe('authorizePlatformAdmin', () => {
  const admin = { ...user, platformRole: 'admin' as const };

  it('returns the actor for a platform admin', async () => {
    const { auth } = setup({ getUser: async () => admin });
    expect(await auth.authorizePlatformAdmin()).toMatchObject({
      actor: { kind: 'platform_admin', userId: 'u-1', role: 'admin' },
    });
  });

  it('returns 404 for a user without a platform role', async () => {
    expect(await status(await setup().auth.authorizePlatformAdmin())).toBe(404);
  });

  it('returns 403 for an insufficient platform role', async () => {
    const { auth } = setup({ getUser: async () => ({ ...admin, platformRole: 'support' }) });
    expect(await status(await auth.authorizePlatformAdmin({ roles: ['owner', 'admin'] }))).toBe(
      403,
    );
  });

  it('returns 401 without a session', async () => {
    const { auth } = setup({ getSession: async () => null });
    expect(await status(await auth.authorizePlatformAdmin())).toBe(401);
  });
});

describe('resolveActor', () => {
  it('resolves an agency actor, a platform actor, or null', async () => {
    const { auth } = setup({ getUser: async () => ({ ...user, platformRole: 'owner' }) });
    expect((await auth.resolveActor('acme'))?.kind).toBe('agency');
    expect((await auth.resolveActor())?.kind).toBe('platform_admin');
    const anon = setup({ getSession: async () => null });
    expect(await anon.auth.resolveActor('acme')).toBeNull();
  });
});
