-- Text extraction state of an uploaded original JD (T-1-05).
ALTER TABLE "JobDescription"
  ADD COLUMN "extractionStatus" TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN "extractionMethod" TEXT,
  ADD COLUMN "extractionError" TEXT,
  ADD COLUMN "parsedFromImage" BOOLEAN NOT NULL DEFAULT false;
