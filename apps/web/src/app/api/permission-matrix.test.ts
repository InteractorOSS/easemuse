// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgencyRole, PlatformRole } from '@easemuse/core';

/**
 * Permission matrix (ADR-012): every tenancy endpoint is called as every kind of caller and must
 * answer exactly as specified: 401 signed out, 404 for outsiders, 403 for a member with too low a
 * role, success otherwise. Real authorizers run; only the session, memberships and services are faked.
 */
type Caller =
  | { kind: 'anonymous' }
  | { kind: 'outsider' }
  | { kind: 'agency'; role: AgencyRole }
  | { kind: 'platform'; role: PlatformRole }
  | { kind: 'user' };

const who = vi.hoisted(() => ({ current: { kind: 'anonymous' } as Caller }));

vi.mock('@/lib/auth/authorize', async () => {
  const { createAuthorizers } = await import('@/lib/auth/authorizers');
  const agency = { id: 'a1', slug: 'acme', name: 'Acme', status: 'active' as const };
  const real = createAuthorizers({
    getSession: async () => (who.current.kind === 'anonymous' ? null : { userId: 'u1', mfa: true }),
    getUser: async () => ({
      id: 'u1',
      email: 'u@x.test',
      name: 'U',
      locale: null,
      platformRole: who.current.kind === 'platform' ? who.current.role : null,
    }),
    getAgency: async (ref) => (ref === 'a1' || ref === 'acme' ? agency : null),
    loadMembership: async () =>
      who.current.kind === 'agency' ? { role: who.current.role, active: true } : null,
    mfaEnforcement: () => 'off',
    log: () => undefined,
  });
  return real;
});

vi.mock('@/server/tenancy/agencies', () => ({
  listAgencies: async () => ({ items: [], nextCursor: null }),
  getAgencyDetail: async () => ({ id: 'a1' }),
  createAgencyWithAdmin: async () => ({
    agency: { id: 'a1', slug: 'new-agency', name: 'New', status: 'active' },
    inviteExpiresAt: new Date(),
  }),
  setAgencyStatus: async () => ({ id: 'a1' }),
}));
vi.mock('@/server/tenancy/members', () => ({
  listMembers: async () => ({ items: [], nextCursor: null }),
  updateMember: async () => ({ userId: 'u2' }),
  listPendingInvites: async () => [],
  createInvite: async () => ({ id: 'i1' }),
  revokeInvite: async () => undefined,
}));
vi.mock('@/lib/db', () => ({
  getPlatformUser: async () => ({ id: 'u1', email: 'u@x.test', name: 'U' }),
  withAgency: async (_agencyId: string, fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock('@/server/artifacts/service', () => ({
  getArtifactWithVersions: async () => ({ id: 'art1', versions: [] }),
  saveEditToLatest: async () => ({ id: 'v2' }),
  approveVersion: async () => ({ versionId: 'v1' }),
  discardVersion: async () => ({ id: 'v1' }),
}));
vi.mock('@/server/ai/provenance', () => ({ getProvenance: async () => ({ id: 'g1' }) }));

import { GET as agenciesGet, POST as agenciesPost } from './admin/v1/agencies/route';
import { GET as agencyGet } from './admin/v1/agencies/[id]/route';
import { POST as suspendPost } from './admin/v1/agencies/[id]/suspend/route';
import { POST as reactivatePost } from './admin/v1/agencies/[id]/reactivate/route';
import { GET as membersGet } from './v1/agencies/[agencyId]/members/route';
import { PATCH as memberPatch } from './v1/agencies/[agencyId]/members/[userId]/route';
import { GET as invitesGet, POST as invitesPost } from './v1/agencies/[agencyId]/invites/route';
import { DELETE as inviteDelete } from './v1/agencies/[agencyId]/invites/[inviteId]/route';
import { GET as artifactGet } from './v1/agencies/[agencyId]/artifacts/[artifactId]/route';
import { POST as versionPost } from './v1/agencies/[agencyId]/artifacts/[artifactId]/versions/route';
import { POST as approvePost } from './v1/agencies/[agencyId]/artifacts/[artifactId]/versions/[versionId]/approve/route';
import { POST as discardPost } from './v1/agencies/[agencyId]/artifacts/[artifactId]/versions/[versionId]/discard/route';
import { GET as generationGet } from './v1/agencies/[agencyId]/ai-generations/[id]/route';

const json = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});
const agencyParams = {
  params: Promise.resolve({
    agencyId: 'acme',
    userId: 'u2',
    inviteId: 'i1',
    artifactId: 'art1',
    versionId: 'v1',
    id: 'g1',
  }),
};
const adminParams = { params: Promise.resolve({ id: 'acme' }) };

interface Endpoint {
  name: string;
  /** Route file, relative to src/app/api: the coverage check below needs every route listed. */
  file: string;
  call: () => Promise<Response>;
  /** Roles allowed in `audience`. */
  audience: 'agency' | 'admin';
  allowed: readonly string[];
}

const AGENCY_ALL = ['admin', 'lead', 'recruiter'] as const;
const endpoints: Endpoint[] = [
  {
    name: 'GET members',
    file: 'v1/agencies/[agencyId]/members/route.ts',
    audience: 'agency',
    allowed: ['admin', 'lead'],
    call: () => membersGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PATCH member',
    file: 'v1/agencies/[agencyId]/members/[userId]/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () =>
      memberPatch(
        new Request('http://x.test/', { ...json({ role: 'lead' }), method: 'PATCH' }),
        agencyParams,
      ),
  },
  {
    name: 'GET invites',
    file: 'v1/agencies/[agencyId]/invites/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => invitesGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST invites',
    file: 'v1/agencies/[agencyId]/invites/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () =>
      invitesPost(
        new Request('http://x.test/', json({ email: 'a@b.test', role: 'recruiter' })),
        agencyParams,
      ),
  },
  {
    name: 'DELETE invite',
    file: 'v1/agencies/[agencyId]/invites/[inviteId]/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => inviteDelete(new Request('http://x.test/', { method: 'DELETE' }), agencyParams),
  },
  {
    name: 'GET artifact',
    file: 'v1/agencies/[agencyId]/artifacts/[artifactId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => artifactGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST artifact version',
    file: 'v1/agencies/[agencyId]/artifacts/[artifactId]/versions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      versionPost(new Request('http://x.test/', json({ content: { a: 1 } })), agencyParams),
  },
  {
    name: 'POST approve',
    file: 'v1/agencies/[agencyId]/artifacts/[artifactId]/versions/[versionId]/approve/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => approvePost(new Request('http://x.test/', json({})), agencyParams),
  },
  {
    name: 'POST discard',
    file: 'v1/agencies/[agencyId]/artifacts/[artifactId]/versions/[versionId]/discard/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => discardPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET ai-generation (provenance)',
    file: 'v1/agencies/[agencyId]/ai-generations/[id]/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => generationGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'GET agencies',
    file: 'admin/v1/agencies/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => agenciesGet(new Request('http://x.test/')),
  },
  {
    name: 'POST agencies',
    file: 'admin/v1/agencies/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      agenciesPost(
        new Request(
          'http://x.test/',
          json({ name: 'New Agency', slug: 'new-agency', adminEmail: 'a@b.test' }),
        ),
      ),
  },
  {
    name: 'GET agency',
    file: 'admin/v1/agencies/[id]/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => agencyGet(new Request('http://x.test/'), adminParams),
  },
  {
    name: 'POST suspend',
    file: 'admin/v1/agencies/[id]/suspend/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      suspendPost(new Request('http://x.test/', json({ reason: 'Unpaid invoice' })), adminParams),
  },
  {
    name: 'POST reactivate',
    file: 'admin/v1/agencies/[id]/reactivate/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      reactivatePost(new Request('http://x.test/', json({ reason: 'Paid' })), adminParams),
  },
];

describe('tenancy permission matrix', () => {
  beforeEach(() => {
    who.current = { kind: 'anonymous' };
  });

  describe.each(endpoints.filter((e) => e.audience === 'agency'))('$name (agency)', (endpoint) => {
    it('answers 401 signed out', async () => {
      who.current = { kind: 'anonymous' };
      expect((await endpoint.call()).status).toBe(401);
    });

    it('answers 404 to a signed-in non-member and to a platform admin without membership', async () => {
      who.current = { kind: 'outsider' };
      expect((await endpoint.call()).status).toBe(404);
      who.current = { kind: 'platform', role: 'owner' };
      expect((await endpoint.call()).status).toBe(404);
    });

    it.each(AGENCY_ALL)('as %s', async (role) => {
      who.current = { kind: 'agency', role };
      const status = (await endpoint.call()).status;
      if (endpoint.allowed.includes(role)) expect(status).toBeLessThan(300);
      else expect(status).toBe(403);
    });
  });

  describe.each(endpoints.filter((e) => e.audience === 'admin'))(
    '$name (platform admin)',
    (endpoint) => {
      it('answers 401 signed out', async () => {
        who.current = { kind: 'anonymous' };
        expect((await endpoint.call()).status).toBe(401);
      });

      it('answers 404 to every non-platform user, whatever their agency role', async () => {
        for (const caller of [
          { kind: 'user' },
          { kind: 'outsider' },
          { kind: 'agency', role: 'admin' },
        ] as Caller[]) {
          who.current = caller;
          expect((await endpoint.call()).status, JSON.stringify(caller)).toBe(404);
        }
      });

      it.each(['owner', 'admin', 'support'] as const)('as platform %s', async (role) => {
        who.current = { kind: 'platform', role };
        const status = (await endpoint.call()).status;
        if (endpoint.allowed.includes(role)) expect(status).toBeLessThan(300);
        else expect(status).toBe(403);
      });
    },
  );

  it('lists every agency and admin route file in the matrix, so a new route cannot skip it', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const full = path.join(dir, n);
        return statSync(full).isDirectory() ? walk(full) : n === 'route.ts' ? [full] : [];
      });
    const root = path.resolve(__dirname);
    // The file download route is covered by its own tests (files.db.test.ts and the e2e gates).
    const onDisk = [...walk(path.join(root, 'admin')), ...walk(path.join(root, 'v1/agencies'))]
      .map((f) => path.relative(root, f))
      .filter((f) => !f.includes('/files/'))
      .sort();
    const covered = [...new Set(endpoints.map((e) => e.file))].sort();
    expect(covered).toEqual(onDisk);
  });
});
