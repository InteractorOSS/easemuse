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
    loadSupportGrant: async () => null,
    requestInfo: async () => ({ method: 'GET', path: '/api/v1/agencies/a-1/clients' }),
    recordSupportView: vi.fn(async () => undefined),
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

describe('authorizeAgency under a support grant (T-13-07, FR-ADM-07)', () => {
  const grant = { id: 'g-1', expiresAt: new Date('2099-01-01T00:00:00Z') };
  const admin: PlatformUser = { ...user, platformRole: 'support' };
  const asSupport = (overrides: Partial<AuthDeps> = {}) =>
    setup({
      getUser: async () => admin,
      loadMembership: async () => null,
      loadSupportGrant: async () => grant,
      ...overrides,
    });

  it('lets a platform administrator with a grant read the workspace, as a lead who cannot administer', async () => {
    const { auth, deps } = asSupport();
    const result = await auth.authorizeAgency('acme');
    expect(result).toMatchObject({
      role: 'lead',
      actor: { kind: 'agency', userId: 'u-1', agencyId: 'a-1', role: 'lead' },
      support: grant,
    });
    expect(deps.recordSupportView).toHaveBeenCalledWith({
      agencyId: 'a-1',
      adminId: 'u-1',
      grantId: 'g-1',
      method: 'GET',
      path: '/api/v1/agencies/a-1/clients',
    });
    expect(await status(await auth.authorizeAgency('acme', { roles: ['admin'] }))).toBe(403);
  });

  it('is a plain 404 without a grant, for a user with no platform role, and when the agency is unknown', async () => {
    expect(
      await status(
        await asSupport({ loadSupportGrant: async () => null }).auth.authorizeAgency('acme'),
      ),
    ).toBe(404);
    expect(
      await status(await asSupport({ getUser: async () => user }).auth.authorizeAgency('acme')),
    ).toBe(404);
    expect(await status(await asSupport().auth.authorizeAgency('nope'))).toBe(404);
  });

  it('refuses every method but GET and HEAD, and logs nothing for a refused request', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { auth, deps } = asSupport({ requestInfo: async () => ({ method, path: '/x' }) });
      const res = (await auth.authorizeAgency('acme')) as Response;
      expect(res.status, method).toBe(403);
      expect((await res.json()).error.code).toBe('support_read_only');
      expect(deps.recordSupportView).not.toHaveBeenCalled();
    }
    expect(
      await status(
        await asSupport({
          requestInfo: async () => ({ method: 'HEAD', path: '/x' }),
        }).auth.authorizeAgency('acme'),
      ),
    ).toBe('ok');
  });

  it('fails closed when the method is unknown or the view cannot be logged', async () => {
    expect(
      await status(await asSupport({ requestInfo: async () => null }).auth.authorizeAgency('acme')),
    ).toBe(403);
    const failing = asSupport({
      recordSupportView: async () => {
        throw new Error('db down');
      },
    });
    await expect(failing.auth.authorizeAgency('acme')).rejects.toThrow('db down');
  });

  it('refuses a suspended agency, and a real member keeps their own role', async () => {
    const suspended = asSupport({ getAgency: async () => ({ ...agency, status: 'suspended' }) });
    expect(await status(await suspended.auth.authorizeAgency('acme'))).toBe(403);
    const member = asSupport({ loadMembership: async () => ({ role: 'admin', active: true }) });
    const result = (await member.auth.authorizeAgency('acme')) as {
      role: string;
      support?: unknown;
    };
    expect(result.role).toBe('admin');
    expect(result.support).toBeUndefined();
    expect(member.deps.recordSupportView).not.toHaveBeenCalled();
  });
});
