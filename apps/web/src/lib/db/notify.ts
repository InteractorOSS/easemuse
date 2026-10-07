// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getDbHandle } from './client';

/**
 * `pg_notify` outside any scoped transaction, for events that carry ids only (job status, system
 * events). Realtime payloads never hold candidate data, so this needs no agency context.
 */
export async function pgNotify(channel: string, payload: string): Promise<void> {
  const { prisma } = getDbHandle();
  await prisma.$executeRaw`SELECT pg_notify(${channel}, ${payload})`;
}
