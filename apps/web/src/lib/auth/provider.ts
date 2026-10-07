// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { OIDCConfig } from 'next-auth/providers';
import type { InteractorSignInUser } from './callbacks';
import { hasMfa } from './mfa';

export interface InteractorProviderInput {
  issuer: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
}

/** "Sign in with Interactor": the Account Server is the OIDC provider, this app is the client. */
export function interactorProvider(
  input: InteractorProviderInput,
): OIDCConfig<Record<string, unknown>> {
  return {
    id: 'interactor',
    name: 'Interactor',
    type: 'oidc',
    issuer: input.issuer,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    authorization: { params: { scope: 'openid profile email' } },
    profile(profile): InteractorSignInUser & { id: string } {
      const sub = String(profile.sub);
      const email = typeof profile.email === 'string' ? profile.email : undefined;
      const username = typeof profile.username === 'string' ? profile.username : undefined;
      return {
        id: sub,
        interactorSubject: sub,
        email: email ?? null,
        name: username ?? email?.split('@')[0] ?? null,
        mfa: hasMfa(profile),
      };
    },
  };
}
