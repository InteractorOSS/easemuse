// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { HubListener } from './channel-hub';

export const HEARTBEAT_MS = 25_000;
export const RECHECK_MS = 5 * 60_000;

export interface SseOptions {
  /** Aborted when the client disconnects. */
  signal: AbortSignal;
  subscribe(listener: HubListener): Promise<() => Promise<void>>;
  /** Called every RECHECK_MS; return false to end the stream (membership revoked mid-stream). */
  stillAllowed?: () => Promise<boolean>;
  heartbeatMs?: number;
  recheckMs?: number;
}

/**
 * Builds a `text/event-stream` response. Comment lines (`:`) keep proxies from closing an idle
 * connection; `retry:` tells EventSource how fast to reconnect.
 */
export function createSseResponse(options: SseOptions): Response {
  const encoder = new TextEncoder();
  let cleanup: (() => Promise<void>) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const timers: ReturnType<typeof setInterval>[] = [];

      const close = async () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearInterval);
        await unsubscribe?.().catch(() => undefined);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      cleanup = close;

      const unsubscribe = await options.subscribe((message) => write(`data: ${message}\n\n`));
      write('retry: 3000\n: connected\n\n');

      timers.push(
        setInterval(() => write(': keep-alive\n\n'), options.heartbeatMs ?? HEARTBEAT_MS),
      );
      if (options.stillAllowed) {
        timers.push(
          setInterval(() => {
            void options.stillAllowed!().then((allowed) => (allowed ? undefined : close()));
          }, options.recheckMs ?? RECHECK_MS),
        );
      }
      if (options.signal.aborted) await close();
      else options.signal.addEventListener('abort', () => void close(), { once: true });
    },
    async cancel() {
      await cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
