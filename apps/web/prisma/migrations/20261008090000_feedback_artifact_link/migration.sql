-- A17 (T-9-03): feedback recorded from an approved interview_feedback draft points at that version,
-- so approving the same version twice records it once.
ALTER TABLE "InterviewFeedback" ADD COLUMN "artifactVersionId" UUID;
CREATE UNIQUE INDEX "InterviewFeedback_artifactVersionId_key" ON "InterviewFeedback"("artifactVersionId");
