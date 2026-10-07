// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getEnv } from '../env';
import { createDbHandle, type DbHandle } from './client';
import { createScope, type Scope } from './scoped';

const globalForDr = globalThis as unknown as { easemuseDataRightsDb?: DbHandle };

function handle(): DbHandle {
  globalForDr.easemuseDataRightsDb ??= (() => {
    const env = getEnv();
    if (!env.DATABASE_URL_DATARIGHTS) {
      // No fallback to the runtime role: it cannot change audit rows, and silently using a more
      // powerful role by accident is exactly what the separate role prevents (ADR-016).
      throw new Error('DATABASE_URL_DATARIGHTS is required for the data-rights job');
    }
    return createDbHandle({
      connectionString: env.DATABASE_URL_DATARIGHTS,
      role: 'worker',
      poolSize: 2,
      ssl: env.DATABASE_SSL === 'true',
    });
  })();
  return globalForDr.easemuseDataRightsDb;
}

/** Agency-scoped transactions as the data-rights role. Only the anonymization job uses this. */
export const dataRightsScope: Scope = createScope(handle);
export const closeDataRightsDb = () =>
  globalForDr.easemuseDataRightsDb?.close() ?? Promise.resolve();
