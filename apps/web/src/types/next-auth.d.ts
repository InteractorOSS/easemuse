// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
    /** True when the Account Server reported a second factor for this sign-in (T-F-24). */
    mfa: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    mfa?: boolean;
  }
}
