// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './api-client';
import { createSseParser, streamAiRunRequest } from './ai-stream-client';
import { streamAiRun } from './http/ai-stream';
import { ApiError } from './http/errors';
import { AiRefusalError } from '@/server/ai/errors';

async function readAll(response: Response): Promise<string> {
  return await response.text();
}

describe('streamAiRun (server)', () => {
  const req = () => new Request('http://x.test', { method: 'POST' });

  it('streams deltas, then the final result', async () => {
    const response = streamAiRun(req(), async ({ onDelta }) => {
      onDelta('{"a"');
      onDelta(':1}');
      return { versionId: 'v1' };
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await readAll(response)).toBe(
      'event: delta\ndata: {"text":"{\\"a\\""}\n\n' +
        'event: delta\ndata: {"text":":1}"}\n\n' +
        'event: done\ndata: {"data":{"versionId":"v1"}}\n\n',
    );
  });

  it('reports a failure as an error event with a safe message and then ends', async () => {
    const text = await readAll(
      streamAiRun(req(), async () => {
        throw new AiRefusalError('refusal');
      }),
    );
    expect(text).toContain('event: error');
    expect(text).toContain('"code":"ai_refused"');
    expect(text).not.toContain('event: done');
  });

  it('passes ApiErrors through with their code and hides unexpected errors', async () => {
    expect(
      await readAll(
        streamAiRun(req(), async () => {
          throw new ApiError('budget_exceeded', 'Budget used', { status: 402 });
        }),
      ),
    ).toContain('"code":"budget_exceeded"');
    const unexpected = await readAll(
      streamAiRun(req(), async () => {
        throw new Error('secret db detail');
      }),
    );
    expect(unexpected).not.toContain('secret');
    expect(unexpected).toContain('internal_error');
  });

  it('aborts the run when the client disconnects', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const response = streamAiRun(
      new Request('http://x.test', { method: 'POST', signal: controller.signal }),
      async ({ signal }) => {
        seen = signal;
        await new Promise((resolve) => signal.addEventListener('abort', resolve));
        throw new Error('aborted');
      },
    );
    const reader = response.body!.getReader();
    await vi.waitFor(() => expect(seen).toBeDefined());
    controller.abort();
    expect(seen!.aborted).toBe(true);
    await reader.read();
  });
});

describe('SSE parser', () => {
  it('returns whole messages and keeps a partial one until it completes', () => {
    const parser = createSseParser();
    expect(parser.push('event: delta\ndata: {"te')).toEqual([]);
    expect(parser.push('xt":"hi"}\n\nevent: done\n')).toEqual([
      { event: 'delta', data: '{"text":"hi"}' },
    ]);
    expect(parser.push('data: {"data":1}\n\n')).toEqual([{ event: 'done', data: '{"data":1}' }]);
  });

  it('ignores comments and handles CRLF and multi-line data', () => {
    const parser = createSseParser();
    expect(parser.push(': keep-alive\r\n\r\nevent: x\r\ndata: a\r\ndata: b\r\n\r\n')).toEqual([
      { event: 'x', data: 'a\nb' },
    ]);
  });

  it('defaults the event name to "message"', () => {
    expect(createSseParser().push('data: 1\n\n')).toEqual([{ event: 'message', data: '1' }]);
  });
});

describe('streamAiRunRequest (client)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const sse = (...events: string[]) =>
    new Response(events.join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  const stub = (response: Response | Error) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (response instanceof Error) throw response;
        return response;
      }),
    );

  it('delivers deltas and resolves with the final data', async () => {
    stub(
      sse(
        'event: delta\ndata: {"text":"a"}\n\n',
        'event: delta\ndata: {"text":"b"}\n\n',
        'event: done\ndata: {"data":{"id":"v1"}}\n\n',
      ),
    );
    const deltas: string[] = [];
    const result = await streamAiRunRequest<{ id: string }>('/api/run', {
      body: { x: 1 },
      onDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual(['a', 'b']);
    expect(result).toEqual({ id: 'v1' });
  });

  it('throws ApiClientError for an error event', async () => {
    stub(sse('event: error\ndata: {"error":{"code":"ai_refused","message":"No"}}\n\n'));
    expect(await streamAiRunRequest('/api/run').catch((e) => e)).toMatchObject({
      code: 'ai_refused',
      message: 'No',
    });
  });

  it('throws the standard error for a failure before streaming starts', async () => {
    stub(Response.json({ error: { code: 'forbidden', message: 'No' } }, { status: 403 }));
    expect(await streamAiRunRequest('/api/run').catch((e) => e)).toMatchObject({
      status: 403,
      code: 'forbidden',
    });
  });

  it('treats a stream that ends without a result as an interrupted run', async () => {
    stub(sse('event: delta\ndata: {"text":"half"}\n\n'));
    expect(await streamAiRunRequest('/api/run').catch((e) => e)).toMatchObject({
      code: 'stream_ended',
    });
  });

  it('reports a network failure', async () => {
    stub(new TypeError('failed to fetch'));
    expect(await streamAiRunRequest('/api/run').catch((e) => e)).toBeInstanceOf(ApiClientError);
  });
});
