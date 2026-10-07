-- What the review dashboard shows for an analysis, kept on the row so listing a position does not open every artifact (T-3-07).
ALTER TABLE "MatchAnalysis" ADD COLUMN "summary" JSONB NOT NULL DEFAULT '{}';
