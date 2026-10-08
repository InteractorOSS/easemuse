-- Recruiter notes on a candidate (T-2-13, FR-SRC-09). Personal data: exported and removed with the candidate.
CREATE TABLE "CandidateNote" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateNote_agencyId_candidateId_createdAt_idx" ON "CandidateNote"("agencyId", "candidateId", "createdAt");

ALTER TABLE "CandidateNote" ADD CONSTRAINT "CandidateNote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidateNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CandidateNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "CandidateNote"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);
