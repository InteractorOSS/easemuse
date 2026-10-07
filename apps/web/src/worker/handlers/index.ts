// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { listActiveAgencyIds, withAgency } from '@/lib/db';
import { runOrphanReport } from '@/server/artifacts/orphans';
import { sendOutboxMessage } from '@/server/messaging/send';
import type { JobRegistry } from '../registry';

/** Modules add their job handlers here as they land (AI gateway, document parsing, messaging...). */
export function registerHandlers(registry: JobRegistry): JobRegistry {
  // Smoke-test job: proves a worker is alive and wired to the queue (no data, no agency needed).
  registry.register('maintenance', 'health.ping', async (ctx) => {
    await ctx.progress({ pong: true });
  });
  registry.register('messaging', 'send', (ctx) => sendOutboxMessage(ctx));
  // Nightly (see scheduler.ts): artifacts whose subject no longer exists (ADR-006).
  registry.register('maintenance', 'artifacts.orphan_report', async (ctx) => {
    const summary = await runOrphanReport({
      agencyIds: listActiveAgencyIds,
      withAgency,
      log: (message, data) => console.warn(JSON.stringify({ message, ...data })),
    });
    await ctx.progress({ ...summary });
  });
  return registry;
}
