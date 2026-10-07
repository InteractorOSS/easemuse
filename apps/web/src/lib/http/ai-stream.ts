// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ApiError } from './errors';
import { toApiError } from '@/server/ai/errors';

/**
 * Streams an AI run as Server-Sent Events (architecture §7: "Streaming drafts"), for A1, A12, A15
 * and A16:
 *
 *   event: delta   data: {"text":"..."}                 text as the model writes it
 *   event: done    data: {"data": <the run result>}     the draft was saved
 *   event: error   data: {"error":{"code","message"}}   nothing was saved
 *
 * Authorization and input validation happen BEFORE this is called, so those failures are ordinary
 * JSON errors. Closing the connection cancels the run (FR-AI-07).
 */
export function streamAiRun<T>(
  req: Request,
  run: (stream: { onDelta: (text: string) => void; signal: AbortSignal }) => Promise<T>,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener('abort', () => abort.abort(), { once: true });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* the client went away */
        }
      };
      try {
        const result = await run({
          onDelta: (text) => send('delta', { text }),
          signal: abort.signal,
        });
        send('done', { data: result });
      } catch (error) {
        const api = error instanceof ApiError ? error : toApiError(error);
        send('error', { error: { code: api.code, message: api.message } });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
