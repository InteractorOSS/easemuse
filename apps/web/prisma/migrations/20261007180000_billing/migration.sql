-- Plans, seats and usage through the Interactor Billing Server (T-13-08, FR-TEN-05, ADR-013).

-- The last plan state read from Billing Server, cached on the agency (a platform table).
ALTER TABLE "Agency" ADD COLUMN "billing" JSONB NOT NULL DEFAULT '{}';

-- Usage already reported (or waiting to be), one row per report; a tenant table under row-level security.
CREATE TABLE "BillingUsageReport" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "BillingUsageReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingUsageReport_agencyId_idempotencyKey_key" ON "BillingUsageReport"("agencyId", "idempotencyKey");
CREATE INDEX "BillingUsageReport_agencyId_metric_periodKey_idx" ON "BillingUsageReport"("agencyId", "metric", "periodKey");

ALTER TABLE "BillingUsageReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingUsageReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "BillingUsageReport"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);
