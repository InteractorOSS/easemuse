-- Tenant export and deletion (T-13-09, T-13-10, FR-TEN-06, FR-ADM-08, ADR-016).

-- A full export of one agency's data, built in the background (tenant table: row-level security).
CREATE TABLE "TenantExport" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "jobRunId" UUID,
    "fileId" UUID,
    "sizeBytes" INTEGER,
    "tableCounts" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TenantExport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantExport_agencyId_createdAt_idx" ON "TenantExport"("agencyId", "createdAt");

ALTER TABLE "TenantExport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantExport" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "TenantExport"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);

-- The platform-side record of a tenant deletion. It has no agencyId column and no RLS on purpose:
-- it must survive the tenant it describes and is reached only through authorizePlatformAdmin.
CREATE TABLE "TenantDeletion" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tenantSlug" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "jobRunId" UUID,
    "counts" JSONB,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantDeletion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantDeletion_tenantId_status_idx" ON "TenantDeletion"("tenantId", "status");
