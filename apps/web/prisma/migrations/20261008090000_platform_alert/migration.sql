-- The latest problem with an AI provider account (for example no credit, or a rejected key), so
-- platform administrators see it in /admin/settings. One row per provider account. Cleared after the
-- next call that works, or when an owner changes the key. Platform table: no agency, no row-level
-- security, and no candidate or client content.
CREATE TABLE "PlatformAlert" (
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAlert_pkey" PRIMARY KEY ("name")
);
