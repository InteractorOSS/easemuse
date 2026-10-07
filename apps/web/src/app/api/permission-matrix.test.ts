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
  setAgencyBudget: async () => ({ id: 'a1', aiMonthlyBudgetUsd: 10 }),
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
vi.mock('@/server/platform/usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/platform/usage')>()),
  getPlatformUsage: async () => [],
}));
vi.mock('@/server/platform/audit-log', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/platform/audit-log')>()),
  listAuditEntries: async () => ({ items: [], nextCursor: null }),
}));
vi.mock('@/server/tenancy/settings', () => ({
  readSettings: async () => ({}),
  updateSettings: async () => ({}),
}));
vi.mock('@/server/tenancy/agency-usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/tenancy/agency-usage')>()),
  getAgencyUsage: async () => ({ month: '2026-10' }),
}));
vi.mock('@/server/platform/admins', () => ({
  listPlatformAdmins: async () => ({ admins: [], invites: [] }),
  invitePlatformAdmin: async () => ({ invite: { id: 'i' }, acceptUrl: 'x' }),
  changePlatformAdminRole: async () => ({ userId: 'u2' }),
  removePlatformAdmin: async () => undefined,
  revokePlatformAdminInvite: async () => undefined,
}));
vi.mock('@/server/activity/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/activity/service')>()),
  listTimeline: async () => ({ items: [], nextCursor: null }),
}));
vi.mock('@/server/clients/service', () => ({
  listClients: async () => ({ items: [], nextCursor: null }),
  createClient: async () => ({ client: {}, similar: [] }),
  getClient: async () => ({}),
  updateClient: async () => ({}),
  addContact: async () => ({}),
  updateContact: async () => ({}),
  removeContact: async () => undefined,
}));
vi.mock('@/server/positions/service', () => ({
  listPositions: async () => ({ items: [], nextCursor: null }),
  createPosition: async () => ({}),
  getPosition: async () => ({}),
  updatePosition: async () => ({}),
  changeStatus: async () => ({}),
}));
vi.mock('@/server/positions/jd', () => ({
  listOriginals: async () => [],
  addPastedOriginal: async () => ({}),
  addUploadedOriginal: async () => ({ id: 'j1' }),
  startExtraction: async () => 'run1',
}));
vi.mock('@/server/positions/structure-jd', () => ({
  planStructureJd: async () => ({ input: {}, inputRefs: {} }),
  runStructureJd: async () => ({}),
}));
vi.mock('@/server/positions/structured-jd', () => ({
  getStructuredJdArtifact: async () => ({ artifactId: null, approvedVersionId: null }),
  listRequirements: async () => [],
}));
vi.mock('@/server/positions/intake', () => ({
  getIntake: async () => ({ answers: {}, jdApproval: null }),
  saveIntake: async () => ({ answers: {}, jdApproval: null }),
  recordJdApproval: async () => ({}),
}));
vi.mock('@/server/positions/intake-questions', () => ({
  getIntakeQuestionsArtifact: async () => ({ artifactId: null, approvedVersionId: null }),
  planIntakeQuestions: async () => ({ input: {}, inputRefs: {} }),
  runIntakeQuestions: async () => ({}),
}));
vi.mock('@/server/positions/success-profile', () => ({
  getSuccessProfileArtifact: async () => ({ artifactId: null, approvedVersionId: null }),
  planSuccessProfile: async () => ({ input: {}, inputRefs: {}, overridden: [] }),
  runSuccessProfile: async () => ({}),
}));
vi.mock('@/server/tasks/service', () => ({
  listTasks: async () => [],
  completeTask: async () => undefined,
  snoozeTask: async () => undefined,
}));
vi.mock('@/server/ai', () => ({ getGateway: () => ({ run: async () => ({}) }) }));
vi.mock('@/server/ai/provenance', () => ({ getProvenance: async () => ({ id: 'g1' }) }));

import { GET as agenciesGet, POST as agenciesPost } from './admin/v1/agencies/route';
import { GET as agencyGet } from './admin/v1/agencies/[id]/route';
import { POST as suspendPost } from './admin/v1/agencies/[id]/suspend/route';
import { POST as reactivatePost } from './admin/v1/agencies/[id]/reactivate/route';
import { PATCH as budgetPatch } from './admin/v1/agencies/[id]/budget/route';
import { GET as usageGet } from './admin/v1/usage/route';
import { GET as auditGet } from './admin/v1/audit/route';
import {
  GET as settingsGet,
  PATCH as settingsPatch,
} from './v1/agencies/[agencyId]/settings/route';
import { GET as agencyUsageGet } from './v1/agencies/[agencyId]/usage/route';
import { GET as adminsGet, POST as adminsPost } from './admin/v1/admins/route';
import { PATCH as adminPatch, DELETE as adminDelete } from './admin/v1/admins/[userId]/route';
import { DELETE as adminInviteDelete } from './admin/v1/admin-invites/[id]/route';
import { GET as activityGet } from './v1/agencies/[agencyId]/activity/route';
import { GET as clientsGet, POST as clientsPost } from './v1/agencies/[agencyId]/clients/route';
import {
  GET as clientGet,
  PATCH as clientPatch,
} from './v1/agencies/[agencyId]/clients/[clientId]/route';
import { POST as contactPost } from './v1/agencies/[agencyId]/clients/[clientId]/contacts/route';
import {
  PATCH as contactPatch,
  DELETE as contactDelete,
} from './v1/agencies/[agencyId]/clients/[clientId]/contacts/[contactId]/route';
import {
  GET as positionsGet,
  POST as positionsPost,
} from './v1/agencies/[agencyId]/positions/route';
import {
  GET as positionGet,
  PATCH as positionPatch,
} from './v1/agencies/[agencyId]/positions/[positionId]/route';
import { POST as positionStatus } from './v1/agencies/[agencyId]/positions/[positionId]/status/route';
import {
  GET as jdGet,
  POST as jdPost,
} from './v1/agencies/[agencyId]/positions/[positionId]/jd/route';
import { POST as structurePost } from './v1/agencies/[agencyId]/positions/[positionId]/jd/structure/route';
import { GET as structuredGet } from './v1/agencies/[agencyId]/positions/[positionId]/structured-jd/route';
import {
  GET as intakeGet,
  PUT as intakePut,
} from './v1/agencies/[agencyId]/positions/[positionId]/intake/route';
import { POST as jdApprovalPost } from './v1/agencies/[agencyId]/positions/[positionId]/jd-approval/route';
import {
  GET as iqGet,
  POST as iqPost,
} from './v1/agencies/[agencyId]/positions/[positionId]/intake-questions/route';
import {
  GET as spGet,
  POST as spPost,
} from './v1/agencies/[agencyId]/positions/[positionId]/success-profile/route';
import { GET as tasksGet } from './v1/agencies/[agencyId]/tasks/route';
import { POST as taskComplete } from './v1/agencies/[agencyId]/tasks/[taskId]/complete/route';
import { POST as taskSnooze } from './v1/agencies/[agencyId]/tasks/[taskId]/snooze/route';
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
    clientId: 'c1',
    contactId: 'k1',
    positionId: 'p1',
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
    name: 'GET settings',
    file: 'v1/agencies/[agencyId]/settings/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => settingsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PATCH settings',
    file: 'v1/agencies/[agencyId]/settings/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () =>
      settingsPatch(
        new Request('http://x.test/', { ...json({ recentlyContactedDays: 7 }), method: 'PATCH' }),
        agencyParams,
      ),
  },
  {
    name: 'GET agency usage',
    file: 'v1/agencies/[agencyId]/usage/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => agencyUsageGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'GET activity timeline',
    file: 'v1/agencies/[agencyId]/activity/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      activityGet(
        new Request(
          'http://x.test/?entityType=position&entityId=11111111-1111-4111-8111-111111111111',
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET clients',
    file: 'v1/agencies/[agencyId]/clients/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => clientsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST clients',
    file: 'v1/agencies/[agencyId]/clients/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => clientsPost(new Request('http://x.test/', json({ name: 'Acme' })), agencyParams),
  },
  {
    name: 'GET client',
    file: 'v1/agencies/[agencyId]/clients/[clientId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => clientGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PATCH client',
    file: 'v1/agencies/[agencyId]/clients/[clientId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      clientPatch(
        new Request('http://x.test/', { ...json({ name: 'Acme 2' }), method: 'PATCH' }),
        agencyParams,
      ),
  },
  {
    name: 'POST contact',
    file: 'v1/agencies/[agencyId]/clients/[clientId]/contacts/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => contactPost(new Request('http://x.test/', json({ name: 'Pat Kim' })), agencyParams),
  },
  {
    name: 'PATCH contact',
    file: 'v1/agencies/[agencyId]/clients/[clientId]/contacts/[contactId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      contactPatch(
        new Request('http://x.test/', { ...json({ name: 'Pat K' }), method: 'PATCH' }),
        agencyParams,
      ),
  },
  {
    name: 'DELETE contact',
    file: 'v1/agencies/[agencyId]/clients/[clientId]/contacts/[contactId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => contactDelete(new Request('http://x.test/', { method: 'DELETE' }), agencyParams),
  },
  {
    name: 'GET positions',
    file: 'v1/agencies/[agencyId]/positions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => positionsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST positions',
    file: 'v1/agencies/[agencyId]/positions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      positionsPost(
        new Request(
          'http://x.test/',
          json({
            clientId: '11111111-1111-4111-8111-111111111111',
            title: 'Engineer',
            location: 'Seoul',
          }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET position',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => positionGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PATCH position',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      positionPatch(
        new Request('http://x.test/', { ...json({ title: 'Engineer II' }), method: 'PATCH' }),
        agencyParams,
      ),
  },
  {
    name: 'POST position status',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/status/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      positionStatus(new Request('http://x.test/', json({ status: 'intake' })), agencyParams),
  },
  {
    name: 'GET position jd',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/jd/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => jdGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST position jd',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/jd/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => jdPost(new Request('http://x.test/', json({ text: 'x'.repeat(60) })), agencyParams),
  },
  {
    name: 'POST position jd structure',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/jd/structure/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => structurePost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET position structured jd',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/structured-jd/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => structuredGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'GET position intake',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/intake/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => intakeGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PUT position intake',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/intake/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      intakePut(
        new Request('http://x.test/', {
          ...json({ answers: { business_reason: { value: 'Growth' } } }),
          method: 'PUT',
        }),
        agencyParams,
      ),
  },
  {
    name: 'POST position jd approval',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/jd-approval/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      jdApprovalPost(
        new Request(
          'http://x.test/',
          json({
            decision: 'approved',
            approverName: 'Hana Choi',
            method: 'email',
            decidedAt: '2026-10-01T00:00:00Z',
          }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET position intake questions',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/intake-questions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => iqGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST position intake questions',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/intake-questions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => iqPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET position success profile',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/success-profile/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => spGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST position success profile',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/success-profile/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => spPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET tasks',
    file: 'v1/agencies/[agencyId]/tasks/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => tasksGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST task complete',
    file: 'v1/agencies/[agencyId]/tasks/[taskId]/complete/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      taskComplete(new Request('http://x.test/', { method: 'POST' }), {
        params: Promise.resolve({ agencyId: 'acme', taskId: 't1' }),
      }),
  },
  {
    name: 'POST task snooze',
    file: 'v1/agencies/[agencyId]/tasks/[taskId]/snooze/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      taskSnooze(new Request('http://x.test/', json({ until: '2099-01-01T00:00:00Z' })), {
        params: Promise.resolve({ agencyId: 'acme', taskId: 't1' }),
      }),
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
    name: 'PATCH budget',
    file: 'admin/v1/agencies/[id]/budget/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      budgetPatch(
        new Request('http://x.test/', { ...json({ aiMonthlyBudgetUsd: 100 }), method: 'PATCH' }),
        adminParams,
      ),
  },
  {
    name: 'GET usage',
    file: 'admin/v1/usage/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => usageGet(new Request('http://x.test/?from=2026-09-01&to=2026-10-01')),
  },
  {
    name: 'GET audit',
    file: 'admin/v1/audit/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => auditGet(new Request('http://x.test/')),
  },
  {
    name: 'GET admins',
    file: 'admin/v1/admins/route.ts',
    audience: 'admin',
    allowed: ['owner'],
    call: () => adminsGet(),
  },
  {
    name: 'POST admins (invite)',
    file: 'admin/v1/admins/route.ts',
    audience: 'admin',
    allowed: ['owner'],
    call: () =>
      adminsPost(new Request('http://x.test/', json({ email: 'a@b.test', role: 'support' }))),
  },
  {
    name: 'PATCH admin role',
    file: 'admin/v1/admins/[userId]/route.ts',
    audience: 'admin',
    allowed: ['owner'],
    call: () =>
      adminPatch(new Request('http://x.test/', { ...json({ role: 'admin' }), method: 'PATCH' }), {
        params: Promise.resolve({ userId: 'u2' }),
      }),
  },
  {
    name: 'DELETE admin',
    file: 'admin/v1/admins/[userId]/route.ts',
    audience: 'admin',
    allowed: ['owner'],
    call: () =>
      adminDelete(new Request('http://x.test/', { method: 'DELETE' }), {
        params: Promise.resolve({ userId: 'u2' }),
      }),
  },
  {
    name: 'DELETE admin invite',
    file: 'admin/v1/admin-invites/[id]/route.ts',
    audience: 'admin',
    allowed: ['owner'],
    call: () => adminInviteDelete(new Request('http://x.test/', { method: 'DELETE' }), adminParams),
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
