// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** API error codes and their HTTP statuses (architecture §7). Shared by routes and the UI. */
export const ERROR_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404, // also "not your agency": other agencies' existence is never disclosed
  conflict: 409,
  guard_failed: 409,
  invalid_input: 422,
  budget_exceeded: 402,
  rate_limited: 429,
  internal_error: 500,
} as const;

export type ApiErrorCode = keyof typeof ERROR_STATUS;

/** Wire shape of every error response: `{ error: { code, message, fields? } }`. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | (string & {});
    message: string;
    /** Per-field messages for `invalid_input`, keyed by dotted path. */
    fields?: Record<string, string>;
  };
}

/** Wire shape of a successful response; lists add an opaque keyset cursor. */
export interface ApiDataBody<T> {
  data: T;
  nextCursor?: string | null;
}
