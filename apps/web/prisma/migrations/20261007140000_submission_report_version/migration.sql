-- One SubmissionReport row per approved report version, so a submission pins the exact text (US-802).
ALTER TABLE "SubmissionReport" ADD COLUMN "versionId" UUID;
