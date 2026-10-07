// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** Agency membership roles (ADR-012). Mirrors the Prisma `AgencyRole` enum. */
export const AGENCY_ROLES = ['admin', 'lead', 'recruiter'] as const;
export type AgencyRole = (typeof AGENCY_ROLES)[number];

/** Team of Wakers platform administrator roles (ADR-012). Mirrors the Prisma `PlatformRole` enum. */
export const PLATFORM_ROLES = ['owner', 'admin', 'support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
