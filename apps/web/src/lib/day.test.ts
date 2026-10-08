// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { expect, it } from 'vitest';
import { dayToInstant } from './day';

it('is noon UTC of the day, but never in the future', () => {
  expect(dayToInstant('2026-10-01', new Date('2026-10-08T05:00:00Z'))).toBe(
    '2026-10-01T12:00:00.000Z',
  );
  expect(dayToInstant('2026-10-08', new Date('2026-10-08T05:00:00Z'))).toBe(
    '2026-10-08T05:00:00.000Z',
  );
  expect(dayToInstant('2026-10-08', new Date('2026-10-08T15:00:00Z'))).toBe(
    '2026-10-08T12:00:00.000Z',
  );
});
