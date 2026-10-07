// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import NextAuth, { type NextAuthResult } from 'next-auth';
import { createAuthCallbacks } from '@/lib/auth/callbacks';
import { interactorProvider } from '@/lib/auth/provider';
import { upsertUserBySubject } from '@/lib/db/platform';
import { getEnv } from '@/lib/env';
import { accountServerUrl } from '@/lib/interactor/service-urls';

/**
 * Agency users and platform administrators sign in with Interactor (OIDC through Auth.js v5,
 * ADR-002). The config is built per request so env is read after it has been validated and loaded.
 * Portal users (release 2) use app-issued magic links and a separate session.
 */
const nextAuth: NextAuthResult = NextAuth(() => {
  const env = getEnv();
  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    session: { strategy: 'jwt' },
    providers: [
      interactorProvider({
        issuer: accountServerUrl(),
        clientId: env.INTERACTOR_AUTH_CLIENT_ID,
        clientSecret: env.INTERACTOR_AUTH_CLIENT_SECRET,
      }),
    ],
    callbacks: createAuthCallbacks({ upsertUserBySubject }),
  };
});

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
