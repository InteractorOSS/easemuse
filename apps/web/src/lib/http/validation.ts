// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { z } from 'zod';
import { ApiError } from './errors';
import { zodFields } from './responses';

function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError('invalid_input', 'Invalid input', { fields: zodFields(result.error) });
  }
  return result.data;
}

/** Parses a JSON request body with a zod schema; throws `invalid_input` (422) on failure. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError('invalid_input', 'Request body must be valid JSON', {
      fields: { _: 'Expected a JSON body' },
    });
  }
  return parseWith(schema, json);
}

/** Parses the URL query string (repeated keys become arrays only if the schema expects them). */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  const params = new URL(req.url).searchParams;
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    raw[key] = all.length > 1 ? all : all[0]!;
  }
  return parseWith(schema, raw);
}
