// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, notFound } from './errors';
import { decodeCursor, encodeCursor, pageQuerySchema, toPage } from './pagination';
import { accepted, created, handleRoute, ok } from './responses';
import { parseBody, parseQuery } from './validation';

const json = (res: Response) => res.json();

describe('responses', () => {
  it('wraps data and disables caching', async () => {
    const res = ok({ a: 1 }, { nextCursor: 'c' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await json(res)).toEqual({ data: { a: 1 }, nextCursor: 'c' });
  });

  it('returns 201 and 202 shapes', async () => {
    expect(created({ id: 1 }).status).toBe(201);
    const res = accepted('job-1');
    expect(res.status).toBe(202);
    expect(await json(res)).toEqual({ data: { jobRunId: 'job-1' } });
  });
});

describe('handleRoute', () => {
  it('maps ApiError to the standard error body and status', async () => {
    const res = await handleRoute(async () => {
      throw notFound('Position');
    });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({
      error: { code: 'not_found', message: 'Position not found' },
    });
  });

  it('maps codes to their statuses', async () => {
    for (const [code, status] of [
      ['forbidden', 403],
      ['guard_failed', 409],
      ['budget_exceeded', 402],
      ['rate_limited', 429],
    ] as const) {
      const res = await handleRoute(async () => {
        throw new ApiError(code, 'x');
      });
      expect(res.status).toBe(status);
    }
  });

  it('maps zod errors to 422 with per-field messages', async () => {
    const res = await handleRoute(async () => {
      z.object({ name: z.string().min(1), a: z.object({ b: z.number() }) }).parse({
        name: '',
        a: { b: 'x' },
      });
      return ok(null);
    });
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error.code).toBe('invalid_input');
    expect(Object.keys(body.error.fields)).toEqual(['name', 'a.b']);
  });

  it('hides internals of unexpected errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleRoute(async () => {
      throw new Error('secret db detail');
    });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await json(res))).not.toContain('secret db detail');
  });
});

describe('validation', () => {
  const schema = z.object({ title: z.string().min(1) });

  it('parses a valid JSON body', async () => {
    const req = new Request('http://x.test', {
      method: 'POST',
      body: JSON.stringify({ title: 'a' }),
    });
    expect(await parseBody(req, schema)).toEqual({ title: 'a' });
  });

  it('rejects invalid and non-JSON bodies with 422', async () => {
    const bad = new Request('http://x.test', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
    });
    await expect(parseBody(bad, schema)).rejects.toMatchObject({
      code: 'invalid_input',
      status: 422,
    });
    const notJson = new Request('http://x.test', { method: 'POST', body: 'nope' });
    await expect(parseBody(notJson, schema)).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('parses query strings', () => {
    const req = new Request('http://x.test/?limit=5&cursor=abc');
    expect(parseQuery(req, pageQuerySchema)).toEqual({ limit: 5, cursor: 'abc' });
    expect(parseQuery(new Request('http://x.test/'), pageQuerySchema).limit).toBe(25);
    expect(() => parseQuery(new Request('http://x.test/?limit=1000'), pageQuerySchema)).toThrow();
  });
});

describe('keyset pagination', () => {
  const rows = [1, 2, 3, 4].map((n) => ({ id: `id${n}`, at: `t${n}` }));
  const keyOf = (r: { id: string; at: string }) => ({ v: r.at, id: r.id });

  it('round-trips an opaque cursor', () => {
    const cursor = encodeCursor({ v: '2026-01-01T00:00:00.000Z', id: 'x' });
    expect(decodeCursor(cursor)).toEqual({ v: '2026-01-01T00:00:00.000Z', id: 'x' });
  });

  it('rejects a tampered cursor', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(ApiError);
    expect(() => decodeCursor(Buffer.from('{"v":1}').toString('base64url'))).toThrow(ApiError);
  });

  it('returns a cursor only when another page exists', () => {
    const page = toPage(rows, 3, keyOf);
    expect(page.items).toHaveLength(3);
    expect(decodeCursor(page.nextCursor!)).toEqual({ v: 't3', id: 'id3' });
    expect(toPage(rows.slice(0, 3), 3, keyOf)).toEqual({
      items: rows.slice(0, 3),
      nextCursor: null,
    });
  });
});
