-- Full-text index for the talent pool (T-2-08, ADR-008). The text column is filled when a profile is
-- approved; 'simple' keeps Korean and English words as they are (no stemming).
CREATE INDEX "Candidate_searchText_idx" ON "Candidate" USING GIN ("searchText");
CREATE INDEX "Candidate_agencyId_createdAt_idx" ON "Candidate"("agencyId", "createdAt");
