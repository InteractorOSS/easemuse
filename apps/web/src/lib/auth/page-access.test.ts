// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/http/errors';

const requireAgency = vi.hoisted(() => vi.fn());
const requirePlatformAdmin = vi.hoisted(() => vi.fn());
vi.mock('./authorize', () => ({ requireAgency, requirePlatformAdmin }));
vi.mock('react', () => ({ cache: <T>(fn: T) => fn }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import { agencyAccess, platformAdminAccess } from './page-access';

beforeEach(() => {
  requireAgency.mockReset();
  requirePlatformAdmin.mockReset();
});

describe('page access', () => {
  it('returns the access when allowed', async () => {
    requireAgency.mockResolvedValue({ role: 'admin' });
    expect(await agencyAccess('acme')).toEqual({ role: 'admin' });
  });

  it('sends a signed-out visitor to sign-in and back', async () => {
    requireAgency.mockRejectedValue(new ApiError('unauthenticated', 'x'));
    await expect(agencyAccess('acme')).rejects.toThrow(
      'REDIRECT /api/auth/signin?callbackUrl=%2Fa%2Facme',
    );
    requirePlatformAdmin.mockRejectedValue(new ApiError('unauthenticated', 'x'));
    await expect(platformAdminAccess()).rejects.toThrow(
      'REDIRECT /api/auth/signin?callbackUrl=%2Fadmin',
    );
  });

  it('tells members of a suspended agency that the workspace is suspended', async () => {
    requireAgency.mockRejectedValue(new ApiError('agency_suspended', 'x', { status: 403 }));
    await expect(agencyAccess('acme')).rejects.toThrow('REDIRECT /suspended');
  });

  it('shows every other refusal as a missing page, whatever the reason', async () => {
    for (const error of [
      new ApiError('not_found', 'x'),
      new ApiError('forbidden', 'x'),
      new ApiError('mfa_required', 'x', { status: 403 }),
    ]) {
      requireAgency.mockRejectedValue(error);
      await expect(agencyAccess('acme')).rejects.toThrow('NOT_FOUND');
    }
    requirePlatformAdmin.mockRejectedValue(new ApiError('not_found', 'x'));
    await expect(platformAdminAccess()).rejects.toThrow('NOT_FOUND');
  });

  it('rethrows unexpected errors untouched', async () => {
    requireAgency.mockRejectedValue(new Error('database down'));
    await expect(agencyAccess('acme')).rejects.toThrow('database down');
  });
});
