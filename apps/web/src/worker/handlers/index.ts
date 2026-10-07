// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { sendOutboxMessage } from '@/server/messaging/send';
import type { JobRegistry } from '../registry';

/** Modules add their job handlers here as they land (AI gateway, document parsing, messaging...). */
export function registerHandlers(registry: JobRegistry): JobRegistry {
  // Smoke-test job: proves a worker is alive and wired to the queue (no data, no agency needed).
  registry.register('maintenance', 'health.ping', async (ctx) => {
    await ctx.progress({ pong: true });
  });
  registry.register('messaging', 'send', (ctx) => sendOutboxMessage(ctx));
  return registry;
}
