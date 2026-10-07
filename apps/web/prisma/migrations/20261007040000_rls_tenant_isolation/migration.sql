-- Row-level security for tenant isolation (ADR-001, tasks T-F-08).
--
-- Every table with an "agencyId" column is isolated by policy `agency_isolation`, except the two
-- platform tables JobRun and PlatformAuditLog (agencyId is nullable there and access is checked in
-- application code). `Agency`, `User`, `PlatformAdminInvite`, `JobRun` and `PlatformAuditLog` hold no
-- candidate data and are not under RLS (ADR-001 "Platform tables").
--
-- The context is `app.agency_id`, set per transaction by withAgency() with
-- set_config(..., true). NULLIF(..., '') is required: after a scoped transaction ends the setting
-- reads as '' (not NULL) on a pooled connection, and ''::uuid would raise (spike TR-007).
-- With no context the predicate is NULL, so no rows are visible (fails closed).
--
-- The runtime role easemuse_app is NOT the table owner and has no BYPASSRLS. FORCE ROW LEVEL
-- SECURITY makes the policies apply to the owner too. In production, ops gives the role a login
-- and password; local development does that in scripts/db/setup-dev.sh.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'easemuse_app') THEN
    CREATE ROLE easemuse_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO easemuse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO easemuse_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO easemuse_app;
-- The runtime role must not touch migration bookkeeping (the table is absent in Prisma's shadow database).
DO $$
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM easemuse_app;
  END IF;
END
$$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO easemuse_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO easemuse_app;

ALTER TABLE "ActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "ActivityLog"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "AiGeneration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiGeneration" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "AiGeneration"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Approval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Approval" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Approval"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Artifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Artifact" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Artifact"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "ArtifactVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArtifactVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "ArtifactVersion"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Candidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Candidate" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Candidate"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "CandidateDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CandidateDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "CandidateDocument"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Client"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "ClientContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientContact" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "ClientContact"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Consent"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "FileBlob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileBlob" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "FileBlob"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "FileObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileObject" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "FileObject"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "IntakeRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntakeRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "IntakeRecord"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Interview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Interview" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Interview"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "InterviewFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InterviewFeedback" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "InterviewFeedback"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "JobDescription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobDescription" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "JobDescription"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "LlmCall" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LlmCall" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "LlmCall"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "MagicLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MagicLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "MagicLink"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "MatchAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchAnalysis" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "MatchAnalysis"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "MemberInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberInvite" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "MemberInvite"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Membership"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Offer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Offer" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Offer"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "OutboxMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "OutboxMessage"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "OutreachTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "OutreachTemplate"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "OutreachTouch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachTouch" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "OutreachTouch"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "PipelineEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "PipelineEntry"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "PipelineTransition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineTransition" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "PipelineTransition"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "PortalShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalShare" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "PortalShare"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "PortalUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortalUser" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "PortalUser"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Position" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Position" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Position"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "PositionTransition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PositionTransition" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "PositionTransition"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "ProfileEmbedding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfileEmbedding" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "ProfileEmbedding"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "ProposedTransition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProposedTransition" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "ProposedTransition"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "QualificationRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QualificationRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "QualificationRecord"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Requirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Requirement" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Requirement"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "ScreeningAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScreeningAssessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "ScreeningAssessment"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Submission"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "SubmissionReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubmissionReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "SubmissionReport"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "SupportAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportAccessGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "SupportAccessGrant"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Suppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Suppression" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Suppression"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "TailoredResume" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TailoredResume" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "TailoredResume"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "Task"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

-- Lookups before an agency is chosen (ADR-001): a signed-in user lists their own memberships across
-- agencies (GET /api/v1/me). Permissive policies are OR-ed with agency_isolation; read-only.
CREATE POLICY membership_self ON "Membership"
  FOR SELECT
  USING ("userId" = NULLIF(current_setting('app.user_id', true), '')::uuid);
