-- Platform configuration (T-16-02, FR-ADM-10): per-agency feature flags and the settings new agencies
-- start from. Both are platform data: Agency and PlatformConfig are not under row-level security.

ALTER TABLE "Agency" ADD COLUMN "featureFlags" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "PlatformConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("key")
);
