-- Pool intelligence and benchmark (ADR-008, US-108, US-205, US-206).

-- Nearest-neighbour search over profile embeddings (cosine distance, pgvector 0.5 or newer).
-- Queries also filter "agencyId" and "kind", so the index narrows candidates and the policy decides.
CREATE INDEX "ProfileEmbedding_embedding_hnsw" ON "ProfileEmbedding" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "ProfileEmbedding_subject" ON "ProfileEmbedding"("agencyId", "kind", "subjectId");

-- A recruiter's decision on one suggested JD change of an approved benchmark (US-108).
CREATE TABLE "BenchmarkDecision" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedById" UUID NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedVersionId" UUID,

    CONSTRAINT "BenchmarkDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BenchmarkDecision_versionId_suggestionId_key" ON "BenchmarkDecision"("versionId", "suggestionId");
CREATE INDEX "BenchmarkDecision_agencyId_positionId_idx" ON "BenchmarkDecision"("agencyId", "positionId");

ALTER TABLE "BenchmarkDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BenchmarkDecision" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "BenchmarkDecision"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "BenchmarkDecision" TO easemuse_app;
