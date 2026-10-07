// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from '@/lib/http/errors';
import { requireAgency, requirePlatformAdmin } from './authorize';

/**
 * Access checks for PAGES and layouts. They answer like the API does but with page behaviour:
 * signed out goes to sign-in, everything else that is refused becomes the same 404 as a page that
 * does not exist (ADR-012). `cache()` shares one check between a layout and its page in the same
 * request, so membership is read once and a refusal is handled in one place.
 */
async function guard<T>(run: () => Promise<T>, callbackUrl: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401)
        redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      notFound();
    }
    throw error;
  }
}

export const agencyAccess = cache((agencySlug: string) =>
  guard(() => requireAgency(agencySlug), `/a/${agencySlug}`),
);

export const platformAdminAccess = cache(() => guard(() => requirePlatformAdmin(), '/admin'));
