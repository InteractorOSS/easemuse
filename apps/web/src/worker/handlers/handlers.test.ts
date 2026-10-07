// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { JobRegistry } from '../registry';
import { registerHandlers } from './index';

describe('registered job handlers', () => {
  const registry = registerHandlers(new JobRegistry());

  it.each([
    ['maintenance', 'health.ping'],
    ['maintenance', 'artifacts.orphan_report'],
    ['messaging', 'send'],
    ['documents', 'jd.extract'],
    ['documents', 'candidate.extract'],
    ['documents', 'render'],
    ['ai', 'profile.structure'],
  ] as const)('handles %s:%s', (queue, name) => {
    expect(registry.get(queue, name)).toBeTypeOf('function');
  });

  it('has nothing registered for a job nobody wrote', () => {
    expect(registry.get('documents', 'unknown')).toBeUndefined();
  });
});
