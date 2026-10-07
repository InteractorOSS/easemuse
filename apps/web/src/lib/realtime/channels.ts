// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Realtime channel names (architecture §5.7). Agency-scoped channels carry the agency id so the
 * SSE route can check membership from the name alone.
 *   agency:<agencyId>                      everything in one agency
 *   agency:<agencyId>:position:<positionId>
 *   user:<userId>                          one person's notifications
 *   job:<jobRunId>                         progress of one background job
 */
export const channels = {
  agency: (agencyId: string) => `agency:${agencyId}`,
  position: (agencyId: string, positionId: string) => `agency:${agencyId}:position:${positionId}`,
  user: (userId: string) => `user:${userId}`,
  job: (jobRunId: string) => `job:${jobRunId}`,
} as const;

export type ParsedChannel =
  | { kind: 'agency'; agencyId: string }
  | { kind: 'position'; agencyId: string; positionId: string }
  | { kind: 'user'; userId: string }
  | { kind: 'job'; jobRunId: string };

const ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const PATTERNS: [RegExp, (m: RegExpExecArray) => ParsedChannel][] = [
  [new RegExp(`^agency:(${ID})$`), (m) => ({ kind: 'agency', agencyId: m[1]! })],
  [
    new RegExp(`^agency:(${ID}):position:(${ID})$`),
    (m) => ({ kind: 'position', agencyId: m[1]!, positionId: m[2]! }),
  ],
  [new RegExp(`^user:(${ID})$`), (m) => ({ kind: 'user', userId: m[1]! })],
  [new RegExp(`^job:(${ID})$`), (m) => ({ kind: 'job', jobRunId: m[1]! })],
];

/** Parses a channel name; null for anything that is not exactly one of the shapes above. */
export function parseChannel(name: string): ParsedChannel | null {
  for (const [pattern, build] of PATTERNS) {
    const match = pattern.exec(name);
    if (match) return build(match);
  }
  return null;
}
