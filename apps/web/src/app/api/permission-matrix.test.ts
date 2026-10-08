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
    loadSupportGrant: async () => null,
    requestInfo: async () => ({ method: 'GET', path: '/' }),
    recordSupportView: async () => undefined,
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
  getAgencyDefaultLocale: async () => null,
  getPlatformUser: async () => ({ id: 'u1', email: 'u@x.test', name: 'U' }),
  withAgency: async (_agencyId: string, fn: (tx: unknown) => unknown) => fn({}),
  getJobRun: async () => ({
    id: 'job1',
    agencyId: 'a1',
    queue: 'ai',
    name: 'x',
    requestedById: 'u1',
    status: 'running',
    progress: null,
    error: null,
  }),
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
vi.mock('@/server/branding/service', () => ({
  readBranding: async () => ({ agencyName: 'Acme' }),
  updateBranding: async () => ({ agencyName: 'Acme' }),
  setLogo: async () => ({ agencyName: 'Acme' }),
  removeLogo: async () => ({ agencyName: 'Acme' }),
}));
vi.mock('@/server/support/access', () => ({
  listSupportGrantsForPlatform: async () => [],
  requestSupportAccess: async () => ({ id: 'g1' }),
  endSupportAccess: async () => ({ id: 'g1' }),
  getSupportOverview: async () => ({ grants: [], views: [] }),
  decideSupportGrant: async () => ({ id: 'g1' }),
  findActiveGrant: async () => null,
  recordSupportView: async () => undefined,
}));
vi.mock('@/server/tenant/export', () => ({
  listTenantExports: async () => [],
  requestTenantExport: async () => ({ id: 'x1', status: 'queued' }),
  getCompletedExportFile: async () => ({ fileId: 'f1' }),
}));
vi.mock('@/server/files/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/files/files')>()),
  openFileForDownload: async () => ({
    kind: 'bytes',
    filename: 'x.zip',
    contentType: 'application/zip',
    bytes: Buffer.from('zip'),
  }),
}));
vi.mock('@/server/tenant/deletion', () => ({
  getLatestTenantDeletion: async () => null,
  requestTenantDeletion: async () => ({ id: 'd1' }),
  cancelTenantDeletion: async () => ({ id: 'd1' }),
  approveTenantDeletion: async () => ({ id: 'd1' }),
  listTenantDeletions: async () => [],
}));
vi.mock('@/server/platform/health', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/platform/health')>()),
  getSystemHealth: async () => ({ queues: [], agencies: [], failedJobs: [] }),
}));
vi.mock('@/server/platform/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/platform/config')>()),
  getNewAgencyDefaultsView: async () => ({}),
  patchNewAgencyDefaults: async () => ({}),
  getAgencyFeatures: async () => ({ agencyId: 'a1', flags: {} }),
  setAgencyFeature: async () => ({ agencyId: 'a1', flags: {} }),
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
vi.mock('@/server/positions/jd-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/positions/jd-export')>()),
  getPdfStatus: async () => ({ versionId: null, document: null }),
  startPdfExport: async () => ({ jobRunId: 'run1', versionId: 'v1' }),
  exportDocx: async () => ({ bytes: Buffer.from('docx'), filename: 'x.docx' }),
}));
vi.mock('@/server/positions/search-criteria', () => ({
  getSearchCriteriaArtifact: async () => ({ artifactId: null, approvedVersionId: null }),
  planSearchCriteria: async () => ({ input: {}, inputRefs: {} }),
  runSearchCriteria: async () => ({}),
}));
vi.mock('@/server/candidates/intake', () => ({
  createCandidateDraft: async () => ({ candidateId: 'c1', documentId: 'd1' }),
  startCandidateExtraction: async () => 'run1',
  requestProfileStructure: async () => 'run1',
}));
vi.mock('@/server/candidates/duplicates', () => ({
  duplicatesForCandidate: async () => [],
  matchKeys: () => ({}),
}));
vi.mock('@/server/candidates/confirm', () => ({
  confirmCandidate: async () => ({ candidateId: 'c1', resolution: 'create', mergedIntoId: null }),
}));
vi.mock('@/server/candidates/service', () => ({
  getCandidate: async () => ({ id: 'c1' }),
  discardDraft: async () => undefined,
}));
vi.mock('@/server/candidates/search', () => ({
  searchCandidates: async () => ({ items: [], nextCursor: null }),
}));
vi.mock('@/server/search/global', () => ({
  globalSearch: async () => ({ clients: [], positions: [], candidates: [] }),
}));
vi.mock('@/server/candidates/do-not-contact', () => ({
  setDoNotContact: async () => ({ doNotContact: true, reason: 'x', at: null }),
}));
vi.mock('@/server/pipeline/service', () => ({
  getEntry: async () => ({}),
  listPositionPipeline: async () => [],
  addCandidateToPosition: async () => ({}),
  transitionEntry: async () => ({}),
}));
vi.mock('@/server/matching/batch', () => ({
  startBatchAnalysis: async () => ({ jobRunId: 'run1', total: 1 }),
}));
vi.mock('@/server/matching/analyze', () => ({
  planMatchAnalysis: async () => ({}),
  analyzeEntry: async () => ({}),
}));
vi.mock('@/server/matching/overrides', () => ({
  getLatestAnalysis: async () => null,
  overrideScore: async () => ({}),
  saveAssessment: async () => ({}),
}));
vi.mock('@/server/matching/dashboard', () => ({
  getDashboard: async () => ({ explainOnly: false, rows: [] }),
  setManualOrder: async () => undefined,
}));
vi.mock('@/server/matching/detail', () => ({
  getAnalysisDetail: async () => ({}),
  markReviewed: async () => ({ reviewed: true }),
}));
vi.mock('@/server/outreach/service', () => ({
  getOutreach: async () => ({}),
  setSequence: async () => ({}),
  planOutreachDraft: async () => ({}),
  draftTouch: async () => ({}),
  sendTouchEmail: async () => ({ outboxMessageId: 'ob1' }),
  markTouchSentByHand: async () => ({}),
  recordResponse: async () => ({}),
}));
vi.mock('@/server/messaging/outbox-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/messaging/outbox-list')>()),
  listOutbox: async () => ({ items: [], nextCursor: null }),
}));
vi.mock('@/server/messaging/outbox', () => ({ dispatchOutboxMessage: async () => undefined }));
vi.mock('@/server/qualification/service', () => ({
  getQualification: async () => ({}),
  createBlankQualification: async () => ({}),
  planQualification: async () => ({}),
  generateQualification: async () => ({}),
  planCallQuestions: async () => ({}),
  generateCallQuestions: async () => ({}),
}));
vi.mock('@/server/resume/tailor', () => ({
  getTailoredResume: async () => ({}),
  planTailoredResume: async () => ({}),
  generateTailoredResume: async () => ({}),
  recheckTailoredResume: async () => ({ ranAt: '', warnings: [] }),
}));
vi.mock('@/server/resume/approval', () => ({
  getApprovals: async () => ({}),
  recordResumeApproval: async () => ({}),
  listConsents: async () => ({ items: [] }),
  recordConsent: async () => ({ items: [] }),
}));
vi.mock('@/server/resume/export', () => ({
  getResumePdfStatus: async () => ({ versionId: null, document: null }),
  startResumePdfExport: async () => ({ jobRunId: 'job1', versionId: 'v1' }),
  exportResumeDocx: async () => ({ bytes: Buffer.from('docx'), filename: 'resume.docx' }),
}));
vi.mock('@/server/submission/report', () => ({
  getReport: async () => ({}),
  planReportDraft: async () => ({}),
  generateReport: async () => ({}),
  recheckReport: async () => ({ ranAt: '', warnings: [] }),
}));
vi.mock('@/server/submission/export', () => ({
  getReportPdfStatus: async () => ({ versionId: null, document: null }),
  startReportPdfExport: async () => ({ jobRunId: 'job1', versionId: 'v1' }),
}));
vi.mock('@/server/submission/submit', () => ({
  getSubmissionOverview: async () => ({}),
  recordSubmission: async () => ({}),
}));
vi.mock('@/server/interviews/service', () => ({
  listInterviews: async () => [],
  createInterview: async () => ({}),
  updateInterview: async () => ({}),
  recordFeedback: async () => ({}),
}));
vi.mock('@/server/offers/service', () => ({
  getOffer: async () => ({}),
  saveOffer: async () => ({}),
  recordOutcome: async () => ({}),
}));
vi.mock('@/lib/queue', () => ({ enqueue: async () => ({ jobRunId: 'job1' }) }));
vi.mock('@/server/privacy/service', () => ({
  listPrivacyRequests: async () => [],
  createPrivacyRequest: async () => ({}),
  beginPrivacyRequest: async () => ({ kind: 'export', candidateId: 'c1' }),
  attachJob: async () => undefined,
  rejectPrivacyRequest: async () => undefined,
}));
vi.mock('@/server/screening/prefill', () => ({
  planScreeningPrefill: async () => ({}),
  generateScreeningPrefill: async () => ({}),
  getScreeningPrefill: async () => null,
}));
vi.mock('@/server/portal/identity', () => ({
  invitePortalUser: async () => ({
    portalUserId: 'pu1',
    audience: 'candidate',
    email: 'a@b.test',
    token: 't',
    expiresAt: new Date(),
  }),
  disablePortalUser: async () => undefined,
}));
vi.mock('@/server/portal/links', () => ({
  emailPortalLink: async () => ({ outboxMessageId: 'ob1' }),
}));
vi.mock('@/server/platform/secrets', () => ({
  getAnthropicKeyStatus: async () => ({
    configured: false,
    source: 'none',
    last4: null,
    updatedAt: null,
    unreadable: false,
  }),
  setAnthropicKey: async () => ({
    configured: true,
    source: 'admin',
    last4: 'abcd',
    updatedAt: null,
    unreadable: false,
  }),
  clearAnthropicKey: async () => ({
    configured: false,
    source: 'none',
    last4: null,
    updatedAt: null,
    unreadable: false,
  }),
  resolveAnthropicKey: async () => undefined,
}));
vi.mock('@/server/ai/key-check', () => ({
  checkAnthropicKey: async () => ({ ok: true, message: 'ok' }),
}));
vi.mock('@/server/portal/publish', () => ({
  publishShare: async () => ({ id: 'sh1' }),
  listSharesFor: async () => [],
  revokeShare: async () => undefined,
}));
vi.mock('@/server/portal/directory', () => ({ listDirectory: async () => [] }));
vi.mock('@/server/portal/proposals', () => ({
  listOpenProposals: async () => [],
  resolveProposal: async () => undefined,
}));
vi.mock('@/server/screening/service', () => ({
  getScreening: async () => ({ items: {}, screeningClass: null, updatedAt: null }),
  saveScreening: async () => ({}),
  classifyEntry: async () => ({}),
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
import { GET as outboxGet } from './v1/agencies/[agencyId]/outbox/route';
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
import {
  GET as exportGet,
  POST as exportPost,
} from './v1/agencies/[agencyId]/positions/[positionId]/jd/export/route';
import {
  GET as scGet,
  POST as scPost,
} from './v1/agencies/[agencyId]/positions/[positionId]/search-criteria/route';
import { POST as intakePost } from './v1/agencies/[agencyId]/candidates/intake/route';
import { POST as structureAgainPost } from './v1/agencies/[agencyId]/candidates/[candidateId]/structure/route';
import { GET as duplicatesGet } from './v1/agencies/[agencyId]/candidates/[candidateId]/duplicates/route';
import { GET as searchGet } from './v1/agencies/[agencyId]/search/route';
import {
  POST as confirmPost,
  GET as candidatesGet,
} from './v1/agencies/[agencyId]/candidates/route';
import { GET as candidateGet } from './v1/agencies/[agencyId]/candidates/[candidateId]/route';
import { POST as discardPost2 } from './v1/agencies/[agencyId]/candidates/[candidateId]/discard/route';
import { PATCH as dncPatch } from './v1/agencies/[agencyId]/candidates/[candidateId]/do-not-contact/route';
import {
  GET as screeningGet,
  PUT as screeningPut,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/screening/route';
import { POST as classifyPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/classification/route';
import { GET as entryGet } from './v1/agencies/[agencyId]/pipeline/[entryId]/route';
import { POST as transitionPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/transitions/route';
import { POST as addToPositionPost } from './v1/agencies/[agencyId]/positions/[positionId]/candidates/route';
import { GET as pipelineGet } from './v1/agencies/[agencyId]/positions/[positionId]/pipeline/route';
import { POST as batchPost } from './v1/agencies/[agencyId]/positions/[positionId]/analyses/route';
import { GET as reviewGet } from './v1/agencies/[agencyId]/positions/[positionId]/review/route';
import {
  PUT as orderPut,
  DELETE as orderDelete,
} from './v1/agencies/[agencyId]/positions/[positionId]/review-order/route';
import { GET as jobGet } from './v1/agencies/[agencyId]/jobs/[jobRunId]/route';
import { GET as outreachGet } from './v1/agencies/[agencyId]/pipeline/[entryId]/outreach/route';
import { PUT as sequencePut } from './v1/agencies/[agencyId]/pipeline/[entryId]/sequence/route';
import { POST as responsePost } from './v1/agencies/[agencyId]/pipeline/[entryId]/response/route';
import { POST as draftPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/touches/[n]/draft/route';
import { POST as touchSendPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/touches/[n]/send/route';
import { POST as markSentPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/touches/[n]/mark-sent/route';
import { GET as qualificationGet } from './v1/agencies/[agencyId]/pipeline/[entryId]/qualification/route';
import { POST as qualificationBlankPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/qualification/blank/route';
import { POST as qualificationStructurePost } from './v1/agencies/[agencyId]/pipeline/[entryId]/qualification/structure/route';
import { POST as callQuestionsPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/call-questions/route';
import {
  GET as tailoredGet,
  POST as tailoredPost,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/tailored-resume/route';
import { POST as tailoredRecheckPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/tailored-resume/fact-check/route';
import {
  GET as approvalsGet,
  POST as approvalsPost,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/approvals/route';
import {
  GET as consentsGet,
  POST as consentsPost,
} from './v1/agencies/[agencyId]/candidates/[candidateId]/consents/route';
import {
  GET as resumeExportGet,
  POST as resumeExportPost,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/tailored-resume/export/route';
import {
  GET as reportGet,
  POST as reportPost,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/submission-report/route';
import { POST as reportRecheckPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/submission-report/fact-check/route';
import {
  GET as reportPdfGet,
  POST as reportPdfPost,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/submission-report/pdf/route';
import {
  GET as submissionsGet,
  POST as submissionsPost,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/submissions/route';
import {
  GET as interviewsGet,
  POST as interviewsPost,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/interviews/route';
import { PATCH as interviewPatch } from './v1/agencies/[agencyId]/pipeline/[entryId]/interviews/[interviewId]/route';
import { POST as feedbackPost } from './v1/agencies/[agencyId]/pipeline/[entryId]/interviews/[interviewId]/feedback/route';
import {
  GET as offerGet,
  PUT as offerPut,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/offer/route';
import { POST as offerOutcomePost } from './v1/agencies/[agencyId]/pipeline/[entryId]/offer/outcome/route';
import {
  GET as privacyGet,
  POST as privacyPost,
} from './v1/agencies/[agencyId]/privacy-requests/route';
import { POST as privacyStartPost } from './v1/agencies/[agencyId]/privacy-requests/[requestId]/start/route';
import { POST as privacyRejectPost } from './v1/agencies/[agencyId]/privacy-requests/[requestId]/reject/route';
import {
  GET as prefillGet,
  POST as prefillPost,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/screening/prefill/route';
import {
  GET as portalDirectoryGet,
  POST as portalInvitePost,
} from './v1/agencies/[agencyId]/portal-users/route';
import { POST as portalDisablePost } from './v1/agencies/[agencyId]/portal-users/[portalUserId]/disable/route';
import {
  DELETE as anthropicDelete,
  GET as anthropicGet,
  PUT as anthropicPut,
} from './admin/v1/settings/anthropic/route';
import { POST as anthropicTestPost } from './admin/v1/settings/anthropic/test/route';
import {
  GET as portalSharesGet,
  POST as portalSharePost,
} from './v1/agencies/[agencyId]/portal-shares/route';
import { DELETE as portalShareDelete } from './v1/agencies/[agencyId]/portal-shares/[shareId]/route';
import { GET as proposalsGet } from './v1/agencies/[agencyId]/proposed-transitions/route';
import { POST as proposalResolvePost } from './v1/agencies/[agencyId]/proposed-transitions/[proposalId]/resolve/route';
import { GET as analysisDetailGet } from './v1/agencies/[agencyId]/analyses/[analysisId]/route';
import { POST as reviewPost } from './v1/agencies/[agencyId]/analyses/[analysisId]/review/route';
import { PATCH as overridePatch } from './v1/agencies/[agencyId]/analyses/[analysisId]/overrides/route';
import { PUT as assessmentPut } from './v1/agencies/[agencyId]/analyses/[analysisId]/assessment/route';
import {
  POST as analyzePost,
  GET as analysisGet,
} from './v1/agencies/[agencyId]/pipeline/[entryId]/analysis/route';
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
import { GET as configGet } from './admin/v1/config/route';
import {
  GET as defaultsGet,
  PATCH as defaultsPatch,
} from './admin/v1/config/new-agency-defaults/route';
import { GET as featuresGet, PUT as featuresPut } from './admin/v1/agencies/[id]/features/route';
import { GET as healthGet } from './admin/v1/health/route';
import { GET as deletionGet, POST as deletionPost } from './admin/v1/agencies/[id]/deletion/route';
import { DELETE as deletionCancel } from './admin/v1/agencies/[id]/deletion/[deletionId]/route';
import { POST as deletionApprove } from './admin/v1/agencies/[id]/deletion/[deletionId]/approve/route';
import { GET as deletionsGet } from './admin/v1/tenant-deletions/route';
import { GET as exportsGet, POST as exportsPost } from './v1/agencies/[agencyId]/data-export/route';
import { GET as exportDownloadGet } from './v1/agencies/[agencyId]/data-export/[exportId]/download/route';
import {
  GET as supportListGet,
  POST as supportRequestPost,
} from './admin/v1/agencies/[id]/support-access/route';
import { DELETE as supportEndDelete } from './admin/v1/agencies/[id]/support-access/[grantId]/route';
import { GET as supportOverviewGet } from './v1/agencies/[agencyId]/support-access/route';
import { POST as supportDecisionPost } from './v1/agencies/[agencyId]/support-access/[grantId]/decision/route';
import {
  GET as brandingGet,
  PATCH as brandingPatch,
} from './v1/agencies/[agencyId]/branding/route';
import { PUT as logoPut, DELETE as logoDelete } from './v1/agencies/[agencyId]/branding/logo/route';

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
    candidateId: 'cand1',
    entryId: 'e1',
    interviewId: 'iv1',
    requestId: 'pr1',
    portalUserId: 'pu1',
    shareId: 'sh1',
    proposalId: '11111111-1111-4111-8111-111111111111',
    analysisId: 'an1',
    n: '1',
    jobRunId: 'job1',
    grantId: 'g1',
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
    name: 'GET outbox',
    file: 'v1/agencies/[agencyId]/outbox/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => outboxGet(new Request('http://x.test/'), agencyParams),
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
    name: 'GET position jd export',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/jd/export/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => exportGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST position jd export',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/jd/export/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => exportPost(new Request('http://x.test/', json({ format: 'pdf' })), agencyParams),
  },
  {
    name: 'GET position search criteria',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/search-criteria/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => scGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST position search criteria',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/search-criteria/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => scPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'POST candidate intake',
    file: 'v1/agencies/[agencyId]/candidates/intake/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      intakePost(
        new Request('http://x.test/', json({ source: 'linkedin', profileText: 'x'.repeat(60) })),
        agencyParams,
      ),
  },
  {
    name: 'POST candidate structure again',
    file: 'v1/agencies/[agencyId]/candidates/[candidateId]/structure/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => structureAgainPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET candidate duplicates',
    file: 'v1/agencies/[agencyId]/candidates/[candidateId]/duplicates/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => duplicatesGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST candidates (confirm)',
    file: 'v1/agencies/[agencyId]/candidates/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      confirmPost(
        new Request('http://x.test/', json({ draftId: '11111111-1111-4111-8111-111111111111' })),
        agencyParams,
      ),
  },
  {
    name: 'GET candidate',
    file: 'v1/agencies/[agencyId]/candidates/[candidateId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => candidateGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST candidate discard',
    file: 'v1/agencies/[agencyId]/candidates/[candidateId]/discard/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => discardPost2(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET candidates (pool search)',
    file: 'v1/agencies/[agencyId]/candidates/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => candidatesGet(new Request('http://x.test/?q=hr'), agencyParams),
  },
  {
    name: 'GET search',
    file: 'v1/agencies/[agencyId]/search/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => searchGet(new Request('http://x.test/?q=hr'), agencyParams),
  },
  {
    name: 'PATCH candidate do-not-contact',
    file: 'v1/agencies/[agencyId]/candidates/[candidateId]/do-not-contact/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      dncPatch(
        new Request('http://x.test/', {
          ...json({ value: true, reason: 'Asked us to stop' }),
          method: 'PATCH',
        }),
        agencyParams,
      ),
  },
  {
    name: 'GET pipeline entry',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => entryGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST pipeline transition',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/transitions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      transitionPost(new Request('http://x.test/', json({ to: 'reviewed' })), agencyParams),
  },
  {
    name: 'POST add candidate to position',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/candidates/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      addToPositionPost(
        new Request(
          'http://x.test/',
          json({ candidateId: '11111111-1111-4111-8111-111111111111' }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET position pipeline',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/pipeline/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => pipelineGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST batch analysis',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/analyses/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      batchPost(
        new Request('http://x.test/', json({ entryIds: ['11111111-1111-4111-8111-111111111111'] })),
        agencyParams,
      ),
  },
  {
    name: 'POST analyze one candidate',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/analysis/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => analyzePost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET latest analysis',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/analysis/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => analysisGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PATCH analysis overrides',
    file: 'v1/agencies/[agencyId]/analyses/[analysisId]/overrides/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      overridePatch(
        new Request('http://x.test/', {
          ...json({ kind: 'overall', score: 70, reason: 'Interview went well' }),
          method: 'PATCH',
        }),
        agencyParams,
      ),
  },
  {
    name: 'PUT analysis assessment',
    file: 'v1/agencies/[agencyId]/analyses/[analysisId]/assessment/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      assessmentPut(
        new Request('http://x.test/', { ...json({ text: 'Strong fit.' }), method: 'PUT' }),
        agencyParams,
      ),
  },
  {
    name: 'GET review dashboard',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/review/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => reviewGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PUT review order',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/review-order/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      orderPut(
        new Request('http://x.test/', { ...json({ entryIds: [] }), method: 'PUT' }),
        agencyParams,
      ),
  },
  {
    name: 'DELETE review order',
    file: 'v1/agencies/[agencyId]/positions/[positionId]/review-order/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => orderDelete(new Request('http://x.test/', { method: 'DELETE' }), agencyParams),
  },
  {
    name: 'GET analysis detail',
    file: 'v1/agencies/[agencyId]/analyses/[analysisId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => analysisDetailGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST analysis mark reviewed',
    file: 'v1/agencies/[agencyId]/analyses/[analysisId]/review/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => reviewPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET job status',
    file: 'v1/agencies/[agencyId]/jobs/[jobRunId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => jobGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'GET outreach',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/outreach/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => outreachGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PUT sequence',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/sequence/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      sequencePut(
        new Request('http://x.test/', { ...json({ channel: 'email' }), method: 'PUT' }),
        agencyParams,
      ),
  },
  {
    name: 'POST response',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/response/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      responsePost(new Request('http://x.test/', json({ response: 'interested' })), agencyParams),
  },
  {
    name: 'POST touch draft',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/touches/[n]/draft/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => draftPost(new Request('http://x.test/', json({})), agencyParams),
  },
  {
    name: 'POST touch send',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/touches/[n]/send/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      touchSendPost(
        new Request('http://x.test/', json({ versionId: '11111111-1111-4111-8111-111111111111' })),
        agencyParams,
      ),
  },
  {
    name: 'POST touch mark-sent',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/touches/[n]/mark-sent/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      markSentPost(
        new Request('http://x.test/', json({ versionId: '11111111-1111-4111-8111-111111111111' })),
        agencyParams,
      ),
  },
  {
    name: 'GET qualification',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/qualification/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => qualificationGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST qualification blank',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/qualification/blank/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      qualificationBlankPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'POST qualification structure',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/qualification/structure/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      qualificationStructurePost(
        new Request('http://x.test/', json({ notes: 'Keen, wants 180-190k, 30 days notice.' })),
        agencyParams,
      ),
  },
  {
    name: 'POST call questions',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/call-questions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => callQuestionsPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET tailored resume',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/tailored-resume/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => tailoredGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST tailored resume',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/tailored-resume/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => tailoredPost(new Request('http://x.test/', json({ blind: false })), agencyParams),
  },
  {
    name: 'POST tailored resume fact check',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/tailored-resume/fact-check/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      tailoredRecheckPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET resume approvals',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/approvals/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => approvalsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST resume approval',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/approvals/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      approvalsPost(
        new Request(
          'http://x.test/',
          json({
            decision: 'approved',
            approverName: 'Alex Kim',
            method: 'email',
            decidedAt: '2026-10-01T00:00:00Z',
          }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET consents',
    file: 'v1/agencies/[agencyId]/candidates/[candidateId]/consents/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => consentsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST consent',
    file: 'v1/agencies/[agencyId]/candidates/[candidateId]/consents/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      consentsPost(
        new Request(
          'http://x.test/',
          json({
            clientId: '11111111-1111-4111-8111-111111111111',
            action: 'given',
            at: '2026-10-01T00:00:00Z',
            method: 'email',
          }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET resume export status',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/tailored-resume/export/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => resumeExportGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST resume export',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/tailored-resume/export/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      resumeExportPost(new Request('http://x.test/', json({ format: 'docx' })), agencyParams),
  },
  {
    name: 'GET submission report',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/submission-report/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => reportGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST submission report',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/submission-report/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => reportPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'POST submission report fact check',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/submission-report/fact-check/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => reportRecheckPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET report pdf status',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/submission-report/pdf/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => reportPdfGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST report pdf',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/submission-report/pdf/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => reportPdfPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET submissions',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/submissions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => submissionsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST submission',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/submissions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      submissionsPost(
        new Request(
          'http://x.test/',
          json({
            reportVersionId: '11111111-1111-4111-8111-111111111111',
            tailoredResumeId: '11111111-1111-4111-8111-111111111111',
            toContactId: '11111111-1111-4111-8111-111111111111',
            method: 'email',
            submittedAt: '2026-10-01T00:00:00Z',
          }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET interviews',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/interviews/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => interviewsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST interview',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/interviews/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      interviewsPost(
        new Request('http://x.test/', json({ roundName: 'HM interview' })),
        agencyParams,
      ),
  },
  {
    name: 'PATCH interview',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/interviews/[interviewId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      interviewPatch(
        new Request('http://x.test/', { ...json({ status: 'completed' }), method: 'PATCH' }),
        agencyParams,
      ),
  },
  {
    name: 'POST interview feedback',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/interviews/[interviewId]/feedback/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      feedbackPost(
        new Request(
          'http://x.test/',
          json({ fromRole: 'hm', ratings: { technicalFit: 'strong' } }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET offer',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/offer/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => offerGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PUT offer',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/offer/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      offerPut(
        new Request('http://x.test/', { ...json({ counterofferRisk: 'low' }), method: 'PUT' }),
        agencyParams,
      ),
  },
  {
    name: 'POST offer outcome',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/offer/outcome/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      offerOutcomePost(
        new Request('http://x.test/', json({ outcome: 'accepted', at: '2026-10-01' })),
        agencyParams,
      ),
  },
  {
    name: 'GET privacy requests',
    file: 'v1/agencies/[agencyId]/privacy-requests/route.ts',
    audience: 'agency',
    allowed: ['admin', 'lead'],
    call: () => privacyGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST privacy request',
    file: 'v1/agencies/[agencyId]/privacy-requests/route.ts',
    audience: 'agency',
    allowed: ['admin', 'lead'],
    call: () =>
      privacyPost(
        new Request(
          'http://x.test/',
          json({ candidateId: '11111111-1111-4111-8111-111111111111', kind: 'export' }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'POST privacy request start',
    file: 'v1/agencies/[agencyId]/privacy-requests/[requestId]/start/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => privacyStartPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'POST privacy request reject',
    file: 'v1/agencies/[agencyId]/privacy-requests/[requestId]/reject/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () =>
      privacyRejectPost(
        new Request('http://x.test/', json({ reason: 'Not the data subject' })),
        agencyParams,
      ),
  },
  {
    name: 'GET screening suggestions',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/screening/prefill/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => prefillGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST screening suggestions',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/screening/prefill/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => prefillPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'POST portal invite',
    file: 'v1/agencies/[agencyId]/portal-users/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      portalInvitePost(
        new Request(
          'http://x.test/',
          json({ audience: 'candidate', candidateId: '11111111-1111-4111-8111-111111111111' }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'POST portal disable',
    file: 'v1/agencies/[agencyId]/portal-users/[portalUserId]/disable/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => portalDisablePost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'POST portal share',
    file: 'v1/agencies/[agencyId]/portal-shares/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      portalSharePost(
        new Request(
          'http://x.test/',
          json({
            kind: 'jd_for_approval',
            portalUserId: '11111111-1111-4111-8111-111111111111',
            subjectId: '11111111-1111-4111-8111-111111111111',
          }),
        ),
        agencyParams,
      ),
  },
  {
    name: 'DELETE portal share',
    file: 'v1/agencies/[agencyId]/portal-shares/[shareId]/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      portalShareDelete(new Request('http://x.test/', { method: 'DELETE' }), agencyParams),
  },
  {
    name: 'GET proposed transitions',
    file: 'v1/agencies/[agencyId]/proposed-transitions/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => proposalsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST resolve proposal',
    file: 'v1/agencies/[agencyId]/proposed-transitions/[proposalId]/resolve/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      proposalResolvePost(new Request('http://x.test/', json({ accept: false })), agencyParams),
  },
  {
    name: 'GET portal directory',
    file: 'v1/agencies/[agencyId]/portal-users/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      portalDirectoryGet(
        new Request('http://x.test/?positionId=11111111-1111-4111-8111-111111111111'),
        agencyParams,
      ),
  },
  {
    name: 'GET portal shares',
    file: 'v1/agencies/[agencyId]/portal-shares/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      portalSharesGet(
        new Request(
          'http://x.test/?kind=submission&subjectId=11111111-1111-4111-8111-111111111111',
        ),
        agencyParams,
      ),
  },
  {
    name: 'GET screening',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/screening/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => screeningGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PUT screening',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/screening/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      screeningPut(
        new Request('http://x.test/', { ...json({ items: {} }), method: 'PUT' }),
        agencyParams,
      ),
  },
  {
    name: 'POST classification',
    file: 'v1/agencies/[agencyId]/pipeline/[entryId]/classification/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () =>
      classifyPost(
        new Request('http://x.test/', json({ screeningClass: 'priority' })),
        agencyParams,
      ),
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
    name: 'GET anthropic key status',
    file: 'admin/v1/settings/anthropic/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => anthropicGet(),
  },
  {
    name: 'PUT anthropic key',
    file: 'admin/v1/settings/anthropic/route.ts',
    audience: 'admin',
    allowed: ['owner'],
    call: () =>
      anthropicPut(
        new Request('http://x.test/', {
          ...json({ apiKey: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz' }),
          method: 'PUT',
        }),
      ),
  },
  {
    name: 'DELETE anthropic key',
    file: 'admin/v1/settings/anthropic/route.ts',
    audience: 'admin',
    allowed: ['owner'],
    call: () => anthropicDelete(),
  },
  {
    name: 'POST anthropic key test',
    file: 'admin/v1/settings/anthropic/test/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () => anthropicTestPost(new Request('http://x.test/', { method: 'POST' })),
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
  {
    name: 'GET branding',
    file: 'v1/agencies/[agencyId]/branding/route.ts',
    audience: 'agency',
    allowed: AGENCY_ALL,
    call: () => brandingGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'PATCH branding',
    file: 'v1/agencies/[agencyId]/branding/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () =>
      brandingPatch(
        new Request('http://x.test/', { ...json({ primaryColor: '#1d4ed8' }), method: 'PATCH' }),
        agencyParams,
      ),
  },
  {
    name: 'PUT branding logo',
    file: 'v1/agencies/[agencyId]/branding/logo/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => {
      const form = new FormData();
      form.set('file', new File([new Uint8Array([1, 2, 3])], 'logo.png'));
      return logoPut(new Request('http://x.test/', { method: 'PUT', body: form }), agencyParams);
    },
  },
  {
    name: 'DELETE branding logo',
    file: 'v1/agencies/[agencyId]/branding/logo/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => logoDelete(new Request('http://x.test/', { method: 'DELETE' }), agencyParams),
  },
  {
    name: 'GET support access (platform)',
    file: 'admin/v1/agencies/[id]/support-access/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => supportListGet(new Request('http://x.test/'), adminParams),
  },
  {
    name: 'POST support access request (platform)',
    file: 'admin/v1/agencies/[id]/support-access/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () =>
      supportRequestPost(
        new Request(
          'http://x.test/',
          json({ reason: 'A customer reported a missing report', hours: 24 }),
        ),
        adminParams,
      ),
  },
  {
    name: 'DELETE support access (platform)',
    file: 'admin/v1/agencies/[id]/support-access/[grantId]/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () =>
      supportEndDelete(new Request('http://x.test/', { method: 'DELETE' }), {
        params: Promise.resolve({ id: 'acme', grantId: 'g1' }),
      }),
  },
  {
    name: 'GET support access overview',
    file: 'v1/agencies/[agencyId]/support-access/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => supportOverviewGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST support access decision',
    file: 'v1/agencies/[agencyId]/support-access/[grantId]/decision/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () =>
      supportDecisionPost(
        new Request('http://x.test/', json({ decision: 'approve' })),
        agencyParams,
      ),
  },
  {
    name: 'GET data exports',
    file: 'v1/agencies/[agencyId]/data-export/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => exportsGet(new Request('http://x.test/'), agencyParams),
  },
  {
    name: 'POST data export',
    file: 'v1/agencies/[agencyId]/data-export/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () => exportsPost(new Request('http://x.test/', { method: 'POST' }), agencyParams),
  },
  {
    name: 'GET data export download',
    file: 'v1/agencies/[agencyId]/data-export/[exportId]/download/route.ts',
    audience: 'agency',
    allowed: ['admin'],
    call: () =>
      exportDownloadGet(new Request('http://x.test/'), {
        params: Promise.resolve({ agencyId: 'acme', exportId: 'x1' }),
      }),
  },
  {
    name: 'GET tenant deletion',
    file: 'admin/v1/agencies/[id]/deletion/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => deletionGet(new Request('http://x.test/'), adminParams),
  },
  {
    name: 'POST tenant deletion request',
    file: 'admin/v1/agencies/[id]/deletion/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      deletionPost(new Request('http://x.test/', json({ confirmSlug: 'acme' })), adminParams),
  },
  {
    name: 'DELETE tenant deletion (cancel)',
    file: 'admin/v1/agencies/[id]/deletion/[deletionId]/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      deletionCancel(new Request('http://x.test/', { method: 'DELETE' }), {
        params: Promise.resolve({ id: 'acme', deletionId: 'd1' }),
      }),
  },
  {
    name: 'POST tenant deletion approve',
    file: 'admin/v1/agencies/[id]/deletion/[deletionId]/approve/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      deletionApprove(new Request('http://x.test/', json({ confirmSlug: 'acme' })), {
        params: Promise.resolve({ id: 'acme', deletionId: 'd1' }),
      }),
  },
  {
    name: 'GET tenant deletions',
    file: 'admin/v1/tenant-deletions/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => deletionsGet(),
  },
  {
    name: 'GET health',
    file: 'admin/v1/health/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => healthGet(new Request('http://x.test/?hours=24')),
  },
  {
    name: 'GET platform config',
    file: 'admin/v1/config/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => configGet(),
  },
  {
    name: 'GET new agency defaults',
    file: 'admin/v1/config/new-agency-defaults/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => defaultsGet(),
  },
  {
    name: 'PATCH new agency defaults',
    file: 'admin/v1/config/new-agency-defaults/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      defaultsPatch(
        new Request('http://x.test/', { ...json({ recentlyContactedDays: 7 }), method: 'PATCH' }),
      ),
  },
  {
    name: 'GET agency features',
    file: 'admin/v1/agencies/[id]/features/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin', 'support'],
    call: () => featuresGet(new Request('http://x.test/'), adminParams),
  },
  {
    name: 'PUT agency feature',
    file: 'admin/v1/agencies/[id]/features/route.ts',
    audience: 'admin',
    allowed: ['owner', 'admin'],
    call: () =>
      featuresPut(
        new Request('http://x.test/', {
          ...json({ flag: 'portals', enabled: false }),
          method: 'PUT',
        }),
        adminParams,
      ),
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
