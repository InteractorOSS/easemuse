// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import os from 'node:os';

/**
 * Test database connections. Tests only ever touch a database whose name ends in `_test`.
 *   admin: table owner / superuser, used for migrations and for seeding platform tables
 *   app:   the restricted runtime role `easemuse_app` (what production connects as)
 * Create both with `pnpm db:setup`.
 */
export const TEST_DATABASE_ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ??
  `postgresql://${encodeURIComponent(os.userInfo().username)}@localhost:5432/easemuse_test`;

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://easemuse_app:easemuse_app@localhost:5432/easemuse_test';

for (const url of [TEST_DATABASE_ADMIN_URL, TEST_DATABASE_URL]) {
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run tests against a database not named *_test: ${url}`);
  }
}
