// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ApiDataBody, ApiErrorBody } from '@easemuse/core';
import { ZodError } from 'zod';
import { ApiError } from './errors';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function ok<T>(data: T, extra: { nextCursor?: string | null } = {}): Response {
  const body: ApiDataBody<T> = { data, ...extra };
  return Response.json(body, { status: 200, headers: NO_STORE });
}

export function created<T>(data: T): Response {
  return Response.json({ data } satisfies ApiDataBody<T>, { status: 201, headers: NO_STORE });
}

/** Long work started as a job; progress arrives over SSE `job:<id>` (architecture §7). */
export function accepted(jobRunId: string): Response {
  return Response.json({ data: { jobRunId } }, { status: 202, headers: NO_STORE });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

export function errorResponse(error: ApiError): Response {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    },
  };
  return Response.json(body, { status: error.status, headers: NO_STORE });
}

/** Maps zod issues to `{ "path.to.field": "message" }` (first message per path wins). */
export function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

/**
 * Wraps a route handler: ApiError and ZodError become standard error responses; anything else is
 * logged server-side and returned as a generic 500 (no internals leak to the client).
 */
export async function handleRoute(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    if (error instanceof ZodError) {
      return errorResponse(
        new ApiError('invalid_input', 'Invalid input', { fields: zodFields(error) }),
      );
    }
    console.error('[api] unhandled error', error);
    return errorResponse(new ApiError('internal_error', 'An unexpected error occurred'));
  }
}
