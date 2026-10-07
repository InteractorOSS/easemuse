// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import type { HubListener } from './channel-hub';
import { createSseResponse } from './sse-stream';

function harness(extra: Partial<Parameters<typeof createSseResponse>[0]> = {}) {
  let listener: HubListener = () => undefined;
  const unsubscribe = vi.fn(async () => undefined);
  const controller = new AbortController();
  const response = createSseResponse({
    signal: controller.signal,
    subscribe: async (l) => {
      listener = l;
      return unsubscribe;
    },
    ...extra,
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const read = async () => decoder.decode((await reader.read()).value);
  return { response, controller, unsubscribe, emit: (m: string) => listener(m), read, reader };
}

describe('createSseResponse', () => {
  it('sends SSE headers, a connect preamble and forwarded messages', async () => {
    const h = harness();
    expect(h.response.headers.get('content-type')).toContain('text/event-stream');
    expect(h.response.headers.get('cache-control')).toContain('no-cache');
    expect(await h.read()).toBe('retry: 3000\n: connected\n\n');
    h.emit('{"type":"x"}');
    expect(await h.read()).toBe('data: {"type":"x"}\n\n');
    h.controller.abort();
  });

  it('unsubscribes when the client disconnects', async () => {
    const h = harness();
    await h.read();
    h.controller.abort();
    await vi.waitFor(() => expect(h.unsubscribe).toHaveBeenCalledTimes(1));
    expect((await h.reader.read()).done).toBe(true);
  });

  it('sends keep-alive comments', async () => {
    const h = harness({ heartbeatMs: 5 });
    await h.read();
    expect(await h.read()).toBe(': keep-alive\n\n');
    h.controller.abort();
  });

  it('ends the stream when access is revoked mid-stream', async () => {
    const h = harness({ stillAllowed: async () => false, recheckMs: 5, heartbeatMs: 10_000 });
    await h.read();
    await vi.waitFor(() => expect(h.unsubscribe).toHaveBeenCalled());
    expect((await h.reader.read()).done).toBe(true);
  });
});
