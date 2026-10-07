-- Candidate drafts and text extraction state of candidate documents (T-2-02).
CREATE TYPE "CandidateStatus" AS ENUM ('draft', 'active', 'discarded');

ALTER TABLE "Candidate" ADD COLUMN "status" "CandidateStatus" NOT NULL DEFAULT 'active';
CREATE INDEX "Candidate_agencyId_status_idx" ON "Candidate"("agencyId", "status");

ALTER TABLE "CandidateDocument"
  ADD COLUMN "extractionStatus" TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN "extractionMethod" TEXT,
  ADD COLUMN "extractionError" TEXT,
  ADD COLUMN "parsedFromImage" BOOLEAN NOT NULL DEFAULT false;
