// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

/** Signed-out visitors: protected pages go to sign-in, protected APIs answer 401, unknown invites 404. */
test.describe('signed-out access', () => {
  for (const path of ['/admin', '/admin/agencies', '/a/some-agency']) {
    test(`${path} redirects to sign-in`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBeGreaterThanOrEqual(300);
      expect(response.status()).toBeLessThan(400);
      expect(response.headers()['location']).toContain('/api/auth/signin');
    });
  }

  for (const path of [
    '/api/v1/me',
    '/api/admin/v1/agencies',
    '/api/v1/agencies/some-agency/members',
  ]) {
    test(`GET ${path} answers 401 with the standard error body`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
      expect((await response.json()).error.code).toBe('unauthenticated');
    });
  }

  test('an invitation for an unknown agency is a 404', async ({ request }) => {
    expect((await request.get('/invite/no-such-agency?token=abc')).status()).toBe(404);
  });
});
