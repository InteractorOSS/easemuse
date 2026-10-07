// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Public surface of the database layer. The unscoped client in ./client is deliberately NOT
// re-exported: application code reaches tenant data only through withAgency() (ADR-001).
export { withAgency, withUser, createScope, type Scope, type ScopedTx } from './scoped';
export * from './platform';
export { assertRuntimeRole, UnsafeDatabaseRoleError } from './startup-check';
export { DEFAULT_POOL_SIZE, TRANSACTION_OPTIONS, type ProcessRole } from './pool-config';
import { getDbHandle } from './client';

/** The runtime connection pool, for startup checks and health probes only (never for queries). */
export const getRuntimePool = () => getDbHandle().pool;
