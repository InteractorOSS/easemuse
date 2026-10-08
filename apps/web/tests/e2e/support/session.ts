// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { encode } from 'next-auth/jwt';
import type { BrowserContext } from '@playwright/test';
import { E2E_AUTH_SECRET, SEED } from './env';

const COOKIE = 'authjs.session-token';

/**
 * Signs the test recruiter in by minting the session cookie Auth.js would have issued after
 * "Sign in with Interactor", using the end-to-end secret that only the test servers know. This is the
 * whole of the test sign-in: the application has no bypass, no test route and no special case, so
 * there is nothing for production to switch on by mistake.
 */
export async function signInAsRecruiter(context: BrowserContext, userId: string): Promise<void> {
  const token = await encode({
    token: {
      sub: SEED.recruiterSubject,
      userId,
      name: SEED.recruiterName,
      email: SEED.recruiterEmail,
      mfa: true,
    },
    secret: E2E_AUTH_SECRET,
    salt: COOKIE,
    maxAge: 60 * 60 * 24,
  });
  await context.addCookies([
    {
      name: COOKIE,
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    },
  ]);
}
