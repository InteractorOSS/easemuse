-- Platform-level secrets entered by an owner in the admin area (for example the Anthropic API key).
-- The value is stored encrypted (AES-256-GCM); only the last four characters are kept in the clear
-- so the page can show which key is in use. Platform table: no agency, so no row-level security.
CREATE TABLE "PlatformSecret" (
    "name" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSecret_pkey" PRIMARY KEY ("name")
);
