// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * A day picked in a date field as the instant to record: noon UTC of that day, but never later than
 * now, so choosing today early in the day is not "in the future" for the server.
 */
export function dayToInstant(day: string, now: Date = new Date()): string {
  const noon = new Date(`${day}T12:00:00Z`);
  return (noon > now ? now : noon).toISOString();
}
