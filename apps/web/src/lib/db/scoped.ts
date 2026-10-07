// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDbHandle, type DbHandle } from './client';
import { TRANSACTION_OPTIONS } from './pool-config';

/** The Prisma client handed to code running inside a scoped transaction. */
export type ScopedTx = Prisma.TransactionClient;

// Loose GUID shape: Postgres uuid columns accept any version, and ids always come from our own database.
const uuid = z.guid();

export interface ScopeOptions {
  /** Sets `app.user_id` too, for the user-scoped Membership policy (ADR-001). */
  userId?: string | undefined;
}

export interface Scope {
  /**
   * Runs `fn` in ONE interactive transaction whose Postgres context is `app.agency_id = agencyId`.
   * Row-level security then limits every statement, including raw SQL, to that agency. The setting
   * is transaction-local (`set_config(..., true)`), so a pooled connection cannot carry it over.
   * Keep `fn` short: long work uses several `withAgency` calls, never one giant transaction.
   */
  withAgency<T>(
    agencyId: string,
    fn: (tx: ScopedTx) => Promise<T>,
    options?: ScopeOptions,
  ): Promise<T>;
  /**
   * Runs `fn` with only `app.user_id` set, for lookups before an agency is chosen: a signed-in
   * user listing their own memberships. Tenant tables stay invisible (no agency context).
   */
  withUser<T>(userId: string, fn: (tx: ScopedTx) => Promise<T>): Promise<T>;
}

export function createScope(getHandle: () => DbHandle): Scope {
  async function run<T>(
    agencyId: string,
    userId: string,
    fn: (tx: ScopedTx) => Promise<T>,
  ): Promise<T> {
    const { prisma } = getHandle();
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.agency_id', ${agencyId}, true), set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    }, TRANSACTION_OPTIONS);
  }

  return {
    async withAgency(agencyId, fn, options) {
      const agency = uuid.parse(agencyId);
      const user = options?.userId === undefined ? '' : uuid.parse(options.userId);
      return run(agency, user, fn);
    },
    async withUser(userId, fn) {
      return run('', uuid.parse(userId), fn);
    },
  };
}

const processScope = createScope(getDbHandle);

export const withAgency = processScope.withAgency;
export const withUser = processScope.withUser;
