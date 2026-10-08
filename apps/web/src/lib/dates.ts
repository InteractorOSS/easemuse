// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** The user's own calendar day as YYYY-MM-DD, the value a date input expects. */
export function localDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A day picked in a date input, as an instant for the API: noon of that day in the user's time
 * zone, but never later than now. A fixed UTC hour would put "today" in the future for part of
 * every day somewhere (before noon UTC, or in the evening in the Americas), and the server
 * refuses dates in the future.
 */
export function dayAsInstant(day: string, now: Date = new Date()): string {
  const noon = new Date(`${day}T12:00:00`);
  return (noon.getTime() > now.getTime() ? now : noon).toISOString();
}

/** A moment as the user's own wall-clock time, the value a datetime-local input expects. */
export function localDateTime(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDay(at)}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * A datetime-local value (the user's wall-clock time) as an instant for the API, or null when it
 * is blank or not a real date. Unlike `dayAsInstant` it is not capped at now: a round is
 * scheduled for later.
 */
export function dateTimeAsInstant(value: string): string | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}
