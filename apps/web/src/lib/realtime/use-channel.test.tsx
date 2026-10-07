// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChannel } from './use-channel';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('useChannel', () => {
  it('connects to the encoded channel URL and delivers parsed events', () => {
    const onEvent = vi.fn();
    renderHook(() => useChannel('job:abc', onEvent));
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toBe('/api/sse/job%3Aabc');
    source.onmessage?.({ data: '{"type":"job.done","ids":{},"ts":"t"}' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'job.done', ids: {}, ts: 't' });
  });

  it('ignores malformed frames', () => {
    const onEvent = vi.fn();
    renderHook(() => useChannel('job:abc', onEvent));
    FakeEventSource.instances[0]!.onmessage?.({ data: 'not json' });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('calls onReconnect on later opens only, and closes on unmount', () => {
    const onReconnect = vi.fn();
    const { unmount } = renderHook(() => useChannel('job:abc', vi.fn(), onReconnect));
    const source = FakeEventSource.instances[0]!;
    source.onopen?.();
    expect(onReconnect).not.toHaveBeenCalled();
    source.onopen?.();
    expect(onReconnect).toHaveBeenCalledTimes(1);
    unmount();
    expect(source.closed).toBe(true);
  });

  it('stays disconnected for a null channel and reconnects when the channel changes', () => {
    const { rerender } = renderHook(({ c }) => useChannel(c, vi.fn()), {
      initialProps: { c: null as string | null },
    });
    expect(FakeEventSource.instances).toHaveLength(0);
    rerender({ c: 'job:1' });
    expect(FakeEventSource.instances).toHaveLength(1);
    rerender({ c: 'job:2' });
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
