// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { listActiveAgencyIds, withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { createClaudePdfReader } from '@/server/ai/pdf-reader';
import { extractJd } from '@/server/positions/jd-extract';
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
  // Reads an uploaded original JD. Scans fall back to the model only when an API key is configured.
  registry.register('documents', 'jd.extract', (ctx) => {
    const apiKey = getEnv().ANTHROPIC_API_KEY;
    return extractJd(ctx, { pdfReader: apiKey ? createClaudePdfReader({ apiKey }) : undefined });
  });
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
