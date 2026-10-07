// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ApiError } from '@/lib/http/errors';
import type { TokenUsage } from './pricing';

/** Base for failures of a model call. `usage` is set when tokens were spent, so the ledger can record them. */
export class AiCallError extends Error {
  constructor(
    message: string,
    public readonly usage?: TokenUsage,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The model declined to answer (`stop_reason: refusal`). Nothing is saved. */
export class AiRefusalError extends AiCallError {}
/** The answer hit the output limit (`stop_reason: max_tokens`) and would be incomplete. */
export class AiTruncatedError extends AiCallError {}
/** The answer did not match the schema, or was empty. */
export class AiInvalidOutputError extends AiCallError {}
/** The provider failed or timed out. `retryable` is true for 429, 5xx and network errors. */
export class AiProviderError extends AiCallError {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status: number | null = null,
  ) {
    super(message);
  }
}
/** The recruiter cancelled the request (FR-AI-07). */
export class AiCancelledError extends AiCallError {}

/** What the user and the API see. Never includes prompt or document content. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AiRefusalError) {
    return new ApiError(
      'ai_refused',
      "The assistant couldn't draft this. Try changing the input.",
      { status: 422 },
    );
  }
  if (error instanceof AiTruncatedError || error instanceof AiInvalidOutputError) {
    return new ApiError('ai_failed', "The assistant's answer was incomplete. Try again.", {
      status: 502,
    });
  }
  if (error instanceof AiCancelledError)
    return new ApiError('ai_cancelled', 'The request was cancelled.', { status: 499 });
  if (error instanceof AiProviderError) {
    return new ApiError(
      'ai_unavailable',
      'The AI service is not available right now. Try again shortly.',
      { status: 503 },
    );
  }
  return new ApiError('internal_error', 'An unexpected error occurred', { status: 500 });
}
