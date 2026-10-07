// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { interactorProvider } from './provider';

const provider = interactorProvider({
  issuer: 'https://auth.example.test',
  clientId: 'id',
  clientSecret: 'secret',
});

describe('interactorProvider', () => {
  it('is an OIDC provider on the Account Server issuer', () => {
    expect(provider).toMatchObject({
      id: 'interactor',
      type: 'oidc',
      issuer: 'https://auth.example.test',
    });
  });

  it('maps the profile to a user keyed on the Account Server subject', () => {
    const user = provider.profile?.(
      { sub: 'sub-1', email: 'a@b.test', amr: ['pwd', 'otp'] },
      {} as never,
    );
    expect(user).toMatchObject({
      id: 'sub-1',
      interactorSubject: 'sub-1',
      email: 'a@b.test',
      name: 'a',
      mfa: true,
    });
  });

  it('marks a password-only sign-in as not MFA', () => {
    const user = provider.profile?.({ sub: 's', email: 'a@b.test', amr: ['pwd'] }, {} as never);
    expect(user).toMatchObject({ mfa: false });
  });
});
