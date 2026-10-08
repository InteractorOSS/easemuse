// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import type { Me } from '@/server/tenancy/me';
import { soleDestination } from './destination';

function me(platformRole: Me['user']['platformRole'], slugs: string[]): Me {
  return {
    user: { id: 'u-1', email: 'a@b.test', name: null, platformRole, locale: null },
    memberships: slugs.map((slug) => ({
      agencyId: `id-${slug}`,
      slug,
      name: slug,
      role: 'recruiter' as const,
    })),
  };
}

describe('soleDestination', () => {
  it('sends a member of one agency to its workbench', () => {
    expect(soleDestination(me(null, ['acme']))).toBe('/a/acme');
  });

  it('sends a platform admin with no agency to the admin console', () => {
    expect(soleDestination(me('owner', []))).toBe('/admin');
  });

  it('lets a member of several agencies choose', () => {
    expect(soleDestination(me(null, ['acme', 'globex']))).toBeNull();
  });

  it('lets a platform admin who is also an agency member choose', () => {
    expect(soleDestination(me('admin', ['acme']))).toBeNull();
  });

  it('has nowhere to send a user with no agency and no platform role', () => {
    expect(soleDestination(me(null, []))).toBeNull();
  });
});
