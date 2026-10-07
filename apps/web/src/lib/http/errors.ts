// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ERROR_STATUS, type ApiErrorCode } from '@easemuse/core';

/** Thrown by services; `handleRoute` turns it into the standard error response. */
export class ApiError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ApiErrorCode | (string & {}),
    message: string,
    options: { status?: number; fields?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? ERROR_STATUS[code as ApiErrorCode] ?? 400;
    this.fields = options.fields;
  }

  readonly fields: Record<string, string> | undefined;
}

export const notFound = (what = 'Resource') => new ApiError('not_found', `${what} not found`);
export const forbidden = (message = 'You do not have permission to do this') =>
  new ApiError('forbidden', message);
export const unauthenticated = (message = 'Sign in required') =>
  new ApiError('unauthenticated', message);
