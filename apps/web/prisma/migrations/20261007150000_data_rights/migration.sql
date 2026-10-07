-- Data rights and append-only audit tables (ADR-016, T-0-03, T-0-06).
--
-- 1. The runtime role can no longer change or remove audit rows. Giving and withdrawing consent,
--    approvals, transitions, LLM calls and the activity log are only ever appended.
-- 2. Anonymizing a candidate must redact personal data inside some of those rows, so a separate role,
--    easemuse_datarights, keeps full rights. Only the data-rights job connects as it (it needs its own
--    login: ops sets the password, local development does it in scripts/db/setup-dev.sh).
-- 3. PrivacyRequest records the export and deletion requests with their deadline (FR-PLT-08).

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE
  "ActivityLog", "PipelineTransition", "PositionTransition", "LlmCall", "Approval", "Consent"
FROM easemuse_app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'easemuse_datarights') THEN
    CREATE ROLE easemuse_datarights NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

ALTER TABLE "Candidate" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

CREATE TABLE "PrivacyRequest" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "source" TEXT NOT NULL DEFAULT 'agency',
    "note" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "requestedById" UUID,
    "decidedById" UUID,
    "decisionNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "fileId" UUID,
    "jobRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrivacyRequest_agencyId_status_deadlineAt_idx" ON "PrivacyRequest"("agencyId", "status", "deadlineAt");
CREATE INDEX "PrivacyRequest_agencyId_candidateId_idx" ON "PrivacyRequest"("agencyId", "candidateId");

ALTER TABLE "PrivacyRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PrivacyRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "PrivacyRequest"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

-- The data-rights role sees the same tenant rows (RLS still applies to it) with full rights,
-- but not the migration bookkeeping.
GRANT USAGE ON SCHEMA public TO easemuse_datarights;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO easemuse_datarights;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO easemuse_datarights;
DO $$
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM easemuse_datarights;
  END IF;
END
$$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO easemuse_datarights;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO easemuse_datarights;
