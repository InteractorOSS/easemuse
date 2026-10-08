// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiWebSearchUnavailableError } from '../errors';
import { createFakeModelClient } from './client';

describe('fake AI model client (AI_FAKE)', () => {
  it('cannot be created in production', () => {
    expect(() => createFakeModelClient({ nodeEnv: 'production' })).toThrow(/production/);
  });

  it('needs the purpose of the call, and reports web search as unavailable', async () => {
    const client = createFakeModelClient({ nodeEnv: 'development' });
    await expect(
      client.complete({
        model: 'claude-sonnet-5-5',
        effort: 'low',
        system: 's',
        user: 'u',
        schema: z.object({}),
        maxTokens: 10,
      }),
    ).rejects.toThrow(/purpose/);
    await expect(
      client.search!({
        model: 'claude-opus-5-5',
        effort: 'high',
        system: 's',
        user: 'u',
        maxTokens: 10,
        maxUses: 1,
        blockedDomains: [],
      }),
    ).rejects.toBeInstanceOf(AiWebSearchUnavailableError);
  });
});
