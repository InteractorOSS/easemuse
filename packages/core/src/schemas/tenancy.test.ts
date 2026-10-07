// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  agencySlugSchema,
  createAgencyInputSchema,
  inviteMemberInputSchema,
  updateMemberInputSchema,
} from './tenancy';

describe('agencySlugSchema', () => {
  it('normalises case and whitespace', () => {
    expect(agencySlugSchema.parse('  Acme-Talent ')).toBe('acme-talent');
  });

  it.each(['ab', '-acme', 'acme-', 'ac me', 'acme_talent', 'a'.repeat(41), 'acme--talent', 'ünï'])(
    'rejects %j',
    (slug) => {
      expect(agencySlugSchema.safeParse(slug).success).toBe(false);
    },
  );

  it.each(['admin', 'api', 'invite', 'Auth'])('rejects reserved name %j', (slug) => {
    expect(agencySlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe('createAgencyInputSchema', () => {
  it('accepts a valid input and defaults the region to us', () => {
    expect(
      createAgencyInputSchema.parse({
        name: ' Acme Talent ',
        slug: 'acme',
        adminEmail: 'Boss@Acme.test',
      }),
    ).toEqual({ name: 'Acme Talent', slug: 'acme', adminEmail: 'boss@acme.test', region: 'us' });
  });

  it('rejects a bad email, short name and unknown region', () => {
    expect(
      createAgencyInputSchema.safeParse({ name: 'A', slug: 'acme', adminEmail: 'x' }).success,
    ).toBe(false);
    expect(
      createAgencyInputSchema.safeParse({
        name: 'Acme',
        slug: 'acme',
        adminEmail: 'a@b.test',
        region: 'eu',
      }).success,
    ).toBe(false);
  });
});

describe('member schemas', () => {
  it('validates invite role and lowercases the email', () => {
    expect(inviteMemberInputSchema.parse({ email: 'A@B.test', role: 'lead' })).toEqual({
      email: 'a@b.test',
      role: 'lead',
    });
    expect(inviteMemberInputSchema.safeParse({ email: 'a@b.test', role: 'owner' }).success).toBe(
      false,
    );
  });

  it('requires at least one change', () => {
    expect(updateMemberInputSchema.safeParse({}).success).toBe(false);
    expect(updateMemberInputSchema.safeParse({ active: false }).success).toBe(true);
    expect(updateMemberInputSchema.safeParse({ role: 'admin' }).success).toBe(true);
  });
});
