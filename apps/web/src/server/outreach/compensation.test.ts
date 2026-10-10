// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { formatCompensation } from './compensation';

describe('formatCompensation', () => {
  it('reads sensibly for a range and for one-sided ranges', () => {
    expect(formatCompensation(100000, 120000, 'USD')).toBe('100,000 to 120,000 USD');
    expect(formatCompensation(100000, null, 'USD')).toBe('from 100,000 USD');
    expect(formatCompensation(null, 120000, 'USD')).toBe('up to 120,000 USD');
    expect(formatCompensation(null, null, 'USD')).toBeNull();
  });
  it('accepts decimal-like values', () => {
    expect(formatCompensation({ toString: () => '100000.00' }, null, 'KRW')).toBe(
      'from 100,000 KRW',
    );
  });
});
