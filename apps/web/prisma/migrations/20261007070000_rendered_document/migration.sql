-- Rendered copies of approved artifact versions (T-1-11).
CREATE TABLE "RenderedDocument" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fileId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderedDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RenderedDocument_versionId_format_contentHash_key" ON "RenderedDocument"("versionId", "format", "contentHash");
CREATE INDEX "RenderedDocument_agencyId_versionId_idx" ON "RenderedDocument"("agencyId", "versionId");

-- Tenant isolation, same policy as every other agency table (ADR-001).
ALTER TABLE "RenderedDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RenderedDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "RenderedDocument"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);
