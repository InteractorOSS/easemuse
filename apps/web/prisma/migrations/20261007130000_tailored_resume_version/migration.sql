-- The exact approved version each TailoredResume row stands for (T-7-04): approving a new version
-- adds a new row, so an earlier candidate approval never covers changed text.
ALTER TABLE "TailoredResume" ADD COLUMN "versionId" UUID;
