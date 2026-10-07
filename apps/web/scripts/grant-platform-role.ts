// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Gives a user access to /admin (the first platform owner has to be created this way).
//
//   pnpm admin:grant <email> <owner|admin|support|none>
//
// The person must have signed in to EaseMuse once so their user exists. Uses DATABASE_ADMIN_URL.
import path from 'node:path';
import pg from 'pg';
import { grantPlatformRole } from '../src/server/platform/grant-role';

try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env.local'));
} catch {
  /* no local env file */
}

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !role) {
    console.error('Usage: pnpm admin:grant <email> <owner|admin|support|none>');
    process.exit(2);
  }
  const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_ADMIN_URL (the owner role) in .env.local');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await grantPlatformRole(client, email, role);
    if (!result.ok) {
      console.error(
        result.reason === 'invalid_role'
          ? 'Role must be owner, admin, support or none.'
          : `No user with email ${email}. Ask them to sign in once first.`,
      );
      process.exit(1);
    }
    console.log(`${result.email} is now platform ${result.role ?? 'nobody (access removed)'}.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
