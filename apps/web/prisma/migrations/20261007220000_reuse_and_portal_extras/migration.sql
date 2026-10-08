-- Portal extras (session C): the hiring manager's intake answers wait on the intake record until the
-- recruiter accepts them (FR-HMP-03); interview time proposals (FR-HMP-06) and a candidate's own
-- updates (FR-CDP-04) are proposals the recruiter resolves.
ALTER TABLE "IntakeRecord" ADD COLUMN "proposals" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "InterviewSlotProposal" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "proposedBy" UUID NOT NULL,
    "roundName" TEXT,
    "format" TEXT,
    "slots" JSONB NOT NULL,
    "note" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "chosenSlot" INTEGER,
    "interviewId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSlotProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterviewSlotProposal_agencyId_entryId_resolvedAt_idx" ON "InterviewSlotProposal"("agencyId", "entryId", "resolvedAt");

ALTER TABLE "InterviewSlotProposal" ADD CONSTRAINT "InterviewSlotProposal_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "PipelineEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CandidateUpdateProposal" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "proposedBy" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "accepted" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateUpdateProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateUpdateProposal_agencyId_candidateId_resolvedAt_idx" ON "CandidateUpdateProposal"("agencyId", "candidateId", "resolvedAt");

ALTER TABLE "CandidateUpdateProposal" ADD CONSTRAINT "CandidateUpdateProposal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, like every table that has an agencyId (ADR-001).
ALTER TABLE "InterviewSlotProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InterviewSlotProposal" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "InterviewSlotProposal"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

ALTER TABLE "CandidateUpdateProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CandidateUpdateProposal" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "CandidateUpdateProposal"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);
