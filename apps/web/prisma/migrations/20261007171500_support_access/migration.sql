-- Support access requests (T-13-07, FR-ADM-07): a platform administrator asks, an agency admin decides.
-- The table already has row-level security (agency_isolation). A request has no approver and no expiry
-- until it is approved, so those two columns become optional.

ALTER TABLE "SupportAccessGrant"
  ALTER COLUMN "grantedById" DROP NOT NULL,
  ALTER COLUMN "expiresAt" DROP NOT NULL,
  ADD COLUMN "requestedHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "deniedAt" TIMESTAMP(3);
