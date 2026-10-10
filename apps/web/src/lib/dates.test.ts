// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { dateTimeAsInstant, dayAsInstant, localDateTime, localDay } from './dates';

describe('date input helpers', () => {
  it("gives the user's own calendar day", () => {
    const now = new Date(2026, 9, 8, 0, 11);
    expect(localDay(now)).toBe('2026-10-08');
  });

  it('never turns today into a moment in the future', () => {
    const earlyMorning = new Date(2026, 9, 8, 0, 11);
    expect(dayAsInstant('2026-10-08', earlyMorning)).toBe(earlyMorning.toISOString());
    const evening = new Date(2026, 9, 8, 21, 0);
    expect(dayAsInstant('2026-10-08', evening)).toBe(new Date(2026, 9, 8, 12).toISOString());
  });

  it('places an earlier day at local noon', () => {
    const now = new Date(2026, 9, 8, 9, 0);
    expect(dayAsInstant('2026-10-05', now)).toBe(new Date(2026, 9, 5, 12).toISOString());
  });

  it('round-trips a wall-clock date and time through an instant', () => {
    const at = new Date(2026, 9, 21, 14, 5);
    expect(localDateTime(at)).toBe('2026-10-21T14:05');
    expect(dateTimeAsInstant('2026-10-21T14:05')).toBe(at.toISOString());
  });

  it('gives no instant for a blank or invalid date and time', () => {
    expect(dateTimeAsInstant('')).toBeNull();
    expect(dateTimeAsInstant('not a date')).toBeNull();
  });
});
