// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useCallback, useRef, useState } from 'react';
import { streamAiRunRequest } from '@/lib/ai-stream-client';
import { ApiClientError } from '@/lib/api-client';

export interface AiRunState {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  /** Text received so far. */
  text: string;
  error?: string;
}

/**
 * Drives a streaming AI request: `start()` posts to the run endpoint and fills `state.text` as the
 * draft is written; `cancel()` closes the connection, which cancels the run server-side and saves
 * nothing. `onDone` receives the final result (the saved draft ids) so the caller can refresh.
 */
export function useAiRun<T>(
  url: string,
  options: { body?: unknown; onDone?: (result: T) => void } = {},
) {
  const [state, setState] = useState<AiRunState>({ status: 'idle', text: '' });
  const controller = useRef<AbortController | null>(null);
  const { body, onDone } = options;

  const start = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ status: 'running', text: '' });
    try {
      const result = await streamAiRunRequest<T>(url, {
        body,
        signal: abort.signal,
        onDelta: (delta) => setState((s) => ({ ...s, text: s.text + delta })),
      });
      setState((s) => ({ ...s, status: 'done' }));
      onDone?.(result);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setState((s) => ({ ...s, status: 'cancelled' }));
        return;
      }
      setState((s) => ({
        ...s,
        status: 'error',
        error: error instanceof ApiClientError ? error.message : String(error),
      }));
    }
  }, [url, body, onDone]);

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { state, start, cancel };
}
