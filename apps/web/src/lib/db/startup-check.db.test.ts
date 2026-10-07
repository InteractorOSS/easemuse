// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, appHandle, dbAvailable } from '@/test/db';
import { assertRuntimeRole, UnsafeDatabaseRoleError } from './startup-check';

describe.skipIf(!dbAvailable())('assertRuntimeRole', () => {
  const handle = appHandle(1);
  afterAll(() => handle.close());

  it('accepts the restricted runtime role', async () => {
    await expect(assertRuntimeRole(handle.pool)).resolves.toEqual({ role: 'easemuse_app' });
  });

  it('refuses a privileged / owner connection', async () => {
    const admin = await adminClient();
    try {
      await expect(assertRuntimeRole(admin)).rejects.toBeInstanceOf(UnsafeDatabaseRoleError);
    } finally {
      await admin.end();
    }
  });
});
