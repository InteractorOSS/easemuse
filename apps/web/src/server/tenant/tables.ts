// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Every table that holds an agency's rows, for tenant export and tenant deletion (T-13-09, T-13-10,
 * ADR-016). Deletion is an explicit, ordered job, not a database cascade, because most of these tables
 * have no relation to `Agency`. The order is the deletion order: a table comes after every table that
 * points at it, so no foreign key ever blocks a delete.
 *
 * ADD A NEW TABLE HERE the moment it gets an `agencyId`. `tables.guard.test.ts` fails when a model
 * with `agencyId` is missing from this list (or listed twice, or out of order), and
 * `tenant-deletion.db.test.ts` proves a fully populated agency can be removed with it.
 */
export const TENANT_TABLES = [
  'ActivityLog',
  'AiGeneration',
  'Approval',
  'ArtifactVersion',
  'CandidateDocument',
  'Consent',
  'FileBlob',
  'FileObject',
  'IntakeRecord',
  'InterviewFeedback',
  'JobDescription',
  'JobRun',
  'LlmCall',
  'MagicLink',
  'MatchAnalysis',
  'MemberInvite',
  'Membership',
  'Offer',
  'OutboxMessage',
  'OutreachTemplate',
  'OutreachTouch',
  'PipelineTransition',
  'PortalShare',
  'PositionTransition',
  'PrivacyRequest',
  'ProfileEmbedding',
  'ProposedTransition',
  'QualificationRecord',
  'RenderedDocument',
  'Requirement',
  'ScreeningAssessment',
  'Submission',
  'SubmissionReport',
  'SupportAccessGrant',
  'Suppression',
  'TailoredResume',
  'Task',
  'TenantExport',
  'Artifact',
  'Interview',
  'PortalUser',
  'ClientContact',
  'PipelineEntry',
  'Candidate',
  'Position',
  'Client',
] as const;
export type TenantTable = (typeof TENANT_TABLES)[number];

/**
 * Tables with an `agencyId` that are NOT part of the deletion on purpose. The platform audit log
 * records what platform administrators did, and it outlives the tenant (it never holds agency content).
 */
export const KEPT_TABLES = ['PlatformAuditLog'] as const;

/** Columns left out of the export: credentials (hashes of one-time links) and binary or derived data. */
export const EXPORT_OMITTED_COLUMNS: Partial<Record<TenantTable, string[]>> = {
  MemberInvite: ['tokenHash'],
  MagicLink: ['tokenHash'],
  ProfileEmbedding: ['embedding'],
};

/** Tables the export does not write as data files: file contents go into `files/` instead. */
export const EXPORT_SKIPPED_TABLES: readonly TenantTable[] = ['FileBlob'];

/** `Table` names come from the list above only, never from input; this makes that explicit at the call site. */
export function quoteTable(table: TenantTable): string {
  if (!(TENANT_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Not a tenant table: ${table}`);
  }
  return `"${table}"`;
}
