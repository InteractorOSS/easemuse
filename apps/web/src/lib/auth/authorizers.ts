// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, AgencyRole, PlatformAdminActor, PlatformRole } from '@easemuse/core';
import type { AgencyRef, PlatformUser } from '@/lib/db/platform';
import { ApiError, forbidden, notFound, unauthenticated } from '@/lib/http/errors';
import { errorResponse } from '@/lib/http/responses';
import { mfaDecision, type MfaEnforcement } from './mfa';

export interface SessionInfo {
  userId: string;
  mfa: boolean;
}

export interface Membership {
  role: AgencyRole;
  active: boolean;
}

/** Everything the authorizers depend on, injected so they test without Auth.js or a database. */
export interface AuthDeps {
  getSession(): Promise<SessionInfo | null>;
  getUser(id: string): Promise<PlatformUser | null>;
  getAgency(ref: string): Promise<AgencyRef | null>;
  loadMembership(agencyId: string, userId: string): Promise<Membership | null>;
  mfaEnforcement(): MfaEnforcement;
  log(message: string, data: Record<string, unknown>): void;
  /** The active support grant of a platform administrator for an agency, if any (FR-TEN-07). */
  loadSupportGrant(agencyId: string, userId: string): Promise<SupportGrant | null>;
  /** Method and path of the request being served; null when unknown (then support access is refused). */
  requestInfo(): Promise<{ method: string; path: string } | null>;
  /** Writes the platform audit entry and the agency activity entry for one read under a grant. */
  recordSupportView(input: {
    agencyId: string;
    adminId: string;
    grantId: string;
    method: string;
    path: string;
  }): Promise<void>;
}

/** A platform administrator's approved, unexpired, unrevoked grant for one agency. */
export interface SupportGrant {
  id: string;
  expiresAt: Date;
}

export interface AgencyAuth {
  actor: AgencyActor;
  agency: AgencyRef;
  role: AgencyRole;
  userId: string;
  /** Set when a platform administrator is looking in under a support grant (read-only, FR-ADM-07). */
  support?: SupportGrant;
}

/** Support access reads like a lead (sees all positions) but can never change anything or reach admin pages. */
const SUPPORT_ROLE: AgencyRole = 'lead';
const SUPPORT_METHODS = ['GET', 'HEAD'];

export interface PlatformAdminAuth {
  actor: PlatformAdminActor;
  user: PlatformUser;
}

export interface AgencyOptions {
  /** Allowed roles; omit for any member. A member with the wrong role gets 403. */
  roles?: readonly AgencyRole[];
}

export interface PlatformOptions {
  roles?: readonly PlatformRole[];
}

export function createAuthorizers(deps: AuthDeps) {
  async function requireSession(): Promise<SessionInfo> {
    const session = await deps.getSession();
    if (!session) throw unauthenticated();
    return session;
  }

  function checkMfa(session: SessionInfo, context: Record<string, unknown>): void {
    const decision = mfaDecision({ enforcement: deps.mfaEnforcement(), mfa: session.mfa });
    if (decision === 'allow_and_log') {
      deps.log('mfa.missing', { userId: session.userId, ...context });
    } else if (decision === 'deny') {
      throw new ApiError('mfa_required', 'Multi-factor authentication is required', {
        status: 403,
      });
    }
  }

  /**
   * Signed-in agency member with an allowed role (ADR-012). Not a member, unknown agency or a
   * deactivated member all return 404 so other agencies' existence is never disclosed; a member
   * with an insufficient role gets 403.
   */
  async function requireAgency(
    agencyRef: string,
    options: AgencyOptions = {},
  ): Promise<AgencyAuth> {
    const session = await requireSession();
    checkMfa(session, { audience: 'agency' });

    const agency = await deps.getAgency(agencyRef);
    if (!agency) throw notFound('Agency');
    const membership = await deps.loadMembership(agency.id, session.userId);
    if (!membership?.active) return requireSupport(agency, session, options);

    if (agency.status === 'suspended' || agency.status === 'closed') {
      throw new ApiError('agency_suspended', 'This agency is not active', { status: 403 });
    }
    if (options.roles && !options.roles.includes(membership.role)) throw forbidden();

    return {
      actor: { kind: 'agency', userId: session.userId, agencyId: agency.id, role: membership.role },
      agency,
      role: membership.role,
      userId: session.userId,
    };
  }

  /**
   * A platform administrator who is not a member gets in only under an active support grant, and
   * only to read: any method but GET or HEAD is refused, the read is logged in both logs before it is
   * served, and a request whose method is unknown is refused (fail closed). Everyone else gets 404.
   */
  async function requireSupport(
    agency: AgencyRef,
    session: SessionInfo,
    options: AgencyOptions,
  ): Promise<AgencyAuth> {
    const user = await deps.getUser(session.userId);
    if (!user?.platformRole) throw notFound('Agency');
    const grant = await deps.loadSupportGrant(agency.id, user.id);
    if (!grant) throw notFound('Agency');
    if (agency.status === 'suspended' || agency.status === 'closed') {
      throw new ApiError('agency_suspended', 'This agency is not active', { status: 403 });
    }
    const request = await deps.requestInfo();
    if (!request || !SUPPORT_METHODS.includes(request.method.toUpperCase())) {
      throw new ApiError('support_read_only', 'Support access is read-only', { status: 403 });
    }
    if (options.roles && !options.roles.includes(SUPPORT_ROLE)) throw forbidden();
    await deps.recordSupportView({
      agencyId: agency.id,
      adminId: user.id,
      grantId: grant.id,
      method: request.method.toUpperCase(),
      path: request.path,
    });
    return {
      actor: { kind: 'agency', userId: user.id, agencyId: agency.id, role: SUPPORT_ROLE },
      agency,
      role: SUPPORT_ROLE,
      userId: user.id,
      support: grant,
    };
  }

  /** Team of Wakers platform administrator (`User.platformRole`); everyone else gets 404. */
  async function requirePlatformAdmin(options: PlatformOptions = {}): Promise<PlatformAdminAuth> {
    const session = await requireSession();
    const user = await deps.getUser(session.userId);
    if (!user?.platformRole) throw notFound();
    checkMfa(session, { audience: 'admin' });
    if (options.roles && !options.roles.includes(user.platformRole)) throw forbidden();
    return {
      actor: { kind: 'platform_admin', userId: user.id, role: user.platformRole },
      user,
    };
  }

  /** Signed-in user with no agency chosen yet (for example `GET /api/v1/me`). */
  async function requireUser(): Promise<{ userId: string }> {
    const { userId } = await requireSession();
    return { userId };
  }

  /**
   * Route-handler form of the above: returns the auth result, or an error `Response` to return
   * as is: `const authed = await authorizeAgency(ref); if (authed instanceof Response) return authed;`
   */
  async function asResponse<T>(run: () => Promise<T>): Promise<T | Response> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);
      throw error;
    }
  }

  return {
    requireAgency,
    requirePlatformAdmin,
    requireUser,
    authorizeAgency: (agencyRef: string, options?: AgencyOptions) =>
      asResponse(() => requireAgency(agencyRef, options)),
    authorizePlatformAdmin: (options?: PlatformOptions) =>
      asResponse(() => requirePlatformAdmin(options)),
    authorizeUser: () => asResponse(() => requireUser()),
    /** The current actor: an agency member when `agencyRef` is given, else a platform admin. */
    async resolveActor(agencyRef?: string): Promise<AgencyActor | PlatformAdminActor | null> {
      try {
        return agencyRef
          ? (await requireAgency(agencyRef)).actor
          : (await requirePlatformAdmin()).actor;
      } catch (error) {
        if (error instanceof ApiError) return null;
        throw error;
      }
    },
  };
}
