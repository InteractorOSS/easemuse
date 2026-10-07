// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ApiClientError } from './api-client';

export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Incremental parser for the SSE format `streamAiRun` writes: feed it text chunks as they arrive and
 * it returns the complete messages found so far, keeping any partial one for the next chunk.
 */
export function createSseParser() {
  let buffer = '';
  return {
    push(chunk: string): SseMessage[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const messages: SseMessage[] = [];
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith(':')) continue; // comment / keep-alive
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length > 0) messages.push({ event, data: data.join('\n') });
      }
      return messages;
    },
  };
}

/**
 * Starts an AI run and streams it. Resolves with the final result; throws `ApiClientError` for any
 * failure (the standard error answer before streaming starts, or an `error` event during it).
 */
export async function streamAiRunRequest<T>(
  url: string,
  options: { body?: unknown; onDelta?: (text: string) => void; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiClientError(0, 'network_error', 'Network error');
  }

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as {
      error?: {
        code?: string;
        message?: string;
        fields?: Record<string, string>;
        guards?: { guard: string; mode: 'block' | 'warn'; message: string }[];
      };
    } | null;
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? 'unknown_error',
      body?.error?.message ?? response.statusText,
      body?.error?.fields,
      body?.error?.guards,
    );
  }

  const parser = createSseParser();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result: { data: T } | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const message of parser.push(decoder.decode(value, { stream: true }))) {
      const payload = JSON.parse(message.data) as {
        text?: string;
        data?: T;
        error?: { code: string; message: string };
      };
      if (message.event === 'delta' && payload.text) options.onDelta?.(payload.text);
      else if (message.event === 'done') result = { data: payload.data as T };
      else if (message.event === 'error')
        throw new ApiClientError(
          200,
          payload.error?.code ?? 'ai_failed',
          payload.error?.message ?? 'The assistant could not finish',
        );
    }
  }
  if (!result)
    throw new ApiClientError(
      0,
      'stream_ended',
      'The connection ended before the draft was complete',
    );
  return result.data;
}
