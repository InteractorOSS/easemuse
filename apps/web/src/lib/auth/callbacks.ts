// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { PlatformUser } from '@/lib/db/platform';
import { hasMfa } from './mfa';

/** What the sign-in callbacks need from storage; injected so they test without a database. */
export interface UserStore {
  upsertUserBySubject(input: {
    subject: string;
    email: string;
    name?: string | null | undefined;
  }): Promise<PlatformUser>;
}

/** Fields the OIDC `profile()` attaches to the Auth.js user. */
export interface InteractorSignInUser {
  email?: string | null;
  name?: string | null;
  interactorSubject?: string | null;
  mfa?: boolean;
}

/**
 * Auth.js callbacks (ADR-002). The JWT holds identity only: the local user id and whether the
 * sign-in used MFA. Agency membership and roles are checked on every request (authorizeAgency),
 * never stored in the session, so removing a member takes effect immediately.
 */
export function createAuthCallbacks(store: UserStore) {
  return {
    async signIn({ user }: { user?: unknown }): Promise<boolean> {
      const u = user as InteractorSignInUser | undefined;
      // No durable subject or no email: refuse rather than create an anonymous account.
      return Boolean(u?.interactorSubject && u.email);
    },

    async jwt({ token, user }: { token: JWT; user?: unknown }): Promise<JWT> {
      const u = user as InteractorSignInUser | undefined;
      if (u?.interactorSubject && u.email) {
        const local = await store.upsertUserBySubject({
          subject: u.interactorSubject,
          email: u.email,
          name: u.name,
        });
        token.userId = local.id;
        token.name = local.name;
        token.email = local.email;
        token.mfa = u.mfa === true;
      }
      return token;
    },

    async session({ session, token }: { session: Session; token: JWT }): Promise<Session> {
      if (typeof token.userId === 'string') session.user.id = token.userId;
      session.mfa = token.mfa === true;
      return session;
    },
  };
}

export { hasMfa };
