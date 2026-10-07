// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { pgNotify } from '../db/notify';
import type { ScopedTx } from '../db/scoped';

/**
 * The single Postgres channel the worker LISTENs on. `pg` LISTEN has no wildcards, so every event
 * goes through one funnel and the client-facing channel name travels in the payload.
 */
export const PG_REALTIME_CHANNEL = 'em_realtime';

export interface RealtimeEnvelope {
  /** Client-facing channel, e.g. `agency:<id>:position:<id>` (see channels.ts). */
  channel: string;
  /** Dot-namespaced event type, e.g. `job.progress`. */
  type: string;
  /** Ids only, never record bodies: NOTIFY payloads are capped at 8000 bytes and must hold no PII. */
  ids: Record<string, unknown>;
  ts: string;
}

const NOTIFY_BYTE_BUDGET = 7_900; // headroom under the 8000-byte pg_notify limit

export function buildEnvelope(
  channel: string,
  type: string,
  ids: Record<string, unknown>,
  now: Date = new Date(),
): string {
  const payload = JSON.stringify({
    channel,
    type,
    ids,
    ts: now.toISOString(),
  } satisfies RealtimeEnvelope);
  if (Buffer.byteLength(payload) > NOTIFY_BYTE_BUDGET) {
    throw new Error(
      `Realtime payload too large for pg_notify (${Buffer.byteLength(payload)} bytes)`,
    );
  }
  return payload;
}

/**
 * Emits an event inside a scoped transaction: the NOTIFY commits with the transaction, so
 * subscribers never see events for rolled-back writes.
 */
export async function publish(
  tx: Pick<ScopedTx, '$executeRaw'>,
  channel: string,
  type: string,
  ids: Record<string, unknown>,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_notify(${PG_REALTIME_CHANNEL}, ${buildEnvelope(channel, type, ids)})`;
}

/** Emits an event outside any transaction (job status from the worker). */
export async function publishDetached(
  channel: string,
  type: string,
  ids: Record<string, unknown>,
): Promise<void> {
  await pgNotify(PG_REALTIME_CHANNEL, buildEnvelope(channel, type, ids));
}
