// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { buildEnvelope } from './publish';

describe('buildEnvelope', () => {
  it('serialises channel, type, ids and a timestamp', () => {
    const payload = JSON.parse(
      buildEnvelope('job:1', 'job.progress', { done: 3 }, new Date('2026-01-01T00:00:00Z')),
    );
    expect(payload).toEqual({
      channel: 'job:1',
      type: 'job.progress',
      ids: { done: 3 },
      ts: '2026-01-01T00:00:00.000Z',
    });
  });

  it('refuses payloads over the pg_notify budget', () => {
    expect(() => buildEnvelope('c', 't', { blob: 'x'.repeat(8000) })).toThrow(/too large/);
  });
});
