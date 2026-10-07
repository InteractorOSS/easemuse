// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { channels, parseChannel } from './channels';

const a = randomUUID();
const b = randomUUID();

describe('channels', () => {
  it('round-trips every channel shape', () => {
    expect(parseChannel(channels.agency(a))).toEqual({ kind: 'agency', agencyId: a });
    expect(parseChannel(channels.position(a, b))).toEqual({
      kind: 'position',
      agencyId: a,
      positionId: b,
    });
    expect(parseChannel(channels.user(a))).toEqual({ kind: 'user', userId: a });
    expect(parseChannel(channels.job(a))).toEqual({ kind: 'job', jobRunId: a });
  });

  it('rejects anything that is not exactly a known shape', () => {
    for (const bad of [
      '',
      'agency:x',
      `agency:${a}:`,
      `agency:${a}:position:x`,
      `user:${a}:extra`,
      `x${channels.job(a)}`,
      `${channels.job(a)}\n`,
      'job:*',
      'agency:*',
    ]) {
      expect(parseChannel(bad), bad).toBeNull();
    }
  });
});
