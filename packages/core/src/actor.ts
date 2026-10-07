// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyRole, PlatformRole } from './roles';

/** Who is acting, resolved per request (ADR-012). Services and jobs take an Actor, never a session. */
export interface AgencyActor {
  kind: 'agency';
  userId: string;
  agencyId: string;
  role: AgencyRole;
}

export interface PlatformAdminActor {
  kind: 'platform_admin';
  userId: string;
  role: PlatformRole;
}

/** Hiring manager or candidate acting through a portal (release 2, ADR-003). */
export interface PortalActor {
  kind: 'portal';
  portalUserId: string;
  agencyId: string;
  audience: 'hiring_manager' | 'candidate';
}

/** Background work with no human behind it (for example `embedding.index`, scheduled jobs). */
export interface SystemActor {
  kind: 'system';
  agencyId: string | null;
}

export type Actor = AgencyActor | PlatformAdminActor | PortalActor | SystemActor;
