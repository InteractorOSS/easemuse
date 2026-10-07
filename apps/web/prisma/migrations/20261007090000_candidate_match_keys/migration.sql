-- Match keys for duplicate detection (T-2-04).
ALTER TABLE "Candidate"
  ADD COLUMN "phoneKey" TEXT,
  ADD COLUMN "profileKey" TEXT,
  ADD COLUMN "employerKeys" TEXT[];

CREATE INDEX "Candidate_agencyId_phoneKey_idx" ON "Candidate"("agencyId", "phoneKey");
CREATE INDEX "Candidate_agencyId_profileKey_idx" ON "Candidate"("agencyId", "profileKey");
CREATE INDEX "Candidate_employerKeys_idx" ON "Candidate" USING GIN ("employerKeys");
