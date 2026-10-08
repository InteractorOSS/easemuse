-- T-5-12: a recruiter's connected mailbox (tokens stay with Interactor).
CREATE TABLE "MailConnection" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailConnection_agencyId_userId_key" ON "MailConnection"("agencyId", "userId");
CREATE INDEX "MailConnection_agencyId_status_idx" ON "MailConnection"("agencyId", "status");

ALTER TABLE "MailConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_isolation ON "MailConnection"
  USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
  WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);
