-- The match analysis read model keeps the criterion scores and the artifact version they came from,
-- so the overall score can be recomputed when the weights change without opening the artifact (T-3-04).
ALTER TABLE "MatchAnalysis"
  ADD COLUMN "versionId" UUID,
  ADD COLUMN "criterionScores" JSONB NOT NULL DEFAULT '{}';
