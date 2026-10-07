// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useEffect, useRef } from 'react';

export interface ChannelEvent {
  type: string;
  ids: Record<string, unknown>;
  ts: string;
}

/**
 * Subscribes to a realtime channel over SSE (`/api/sse/<channel>`). EventSource reconnects on its
 * own; `onReconnect` fires after every reconnect so the caller can refetch what it missed (delivery
 * is at-most-once). Pass `null` to stay disconnected.
 */
export function useChannel(
  channel: string | null,
  onEvent: (event: ChannelEvent) => void,
  onReconnect?: () => void,
): void {
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onEventRef.current = onEvent;
    onReconnectRef.current = onReconnect;
  });

  useEffect(() => {
    if (!channel) return;
    const source = new EventSource(`/api/sse/${encodeURIComponent(channel)}`);
    let opened = false;
    source.onopen = () => {
      if (opened) onReconnectRef.current?.();
      opened = true;
    };
    source.onmessage = (message: MessageEvent<string>) => {
      try {
        onEventRef.current(JSON.parse(message.data) as ChannelEvent);
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => source.close();
  }, [channel]);
}
