// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { ApiError } from './errors';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Common list query: `?limit=&cursor=`. Extend with `.extend({...})` for resource filters. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

/** Keyset position: the sort value (ISO time or string) plus the row id as a tie-breaker. */
const keySchema = z.object({ v: z.string(), id: z.string() });
export type PageKey = z.infer<typeof keySchema>;

/** Opaque cursor: base64url JSON of the last row's key. Clients must not parse it. */
export function encodeCursor(key: PageKey): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

export function decodeCursor(cursor: string): PageKey {
  try {
    return keySchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new ApiError('invalid_input', 'Invalid cursor', { fields: { cursor: 'Invalid cursor' } });
  }
}

/**
 * Turns `limit + 1` fetched rows into a page: callers query `take: limit + 1`, and the extra row
 * only signals that another page exists.
 */
export function toPage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => PageKey,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  return { items, nextCursor: encodeCursor(keyOf(items[items.length - 1]!)) };
}
