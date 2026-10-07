// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import pg from 'pg';
import type { Redis } from 'ioredis';
import { PG_REALTIME_CHANNEL, type RealtimeEnvelope } from '@/lib/realtime/publish';
import { redisChannel } from '@/lib/realtime/redis-channel';

export interface PgListenOptions {
  connectionString: string;
  /** Publisher connection (not the subscriber used by the web hub). */
  redis: Redis;
  reconnectDelayMs?: number;
  log?(message: string, data?: Record<string, unknown>): void;
}

/**
 * Forwards Postgres NOTIFY events to Redis pub/sub (architecture §5.7): web processes subscribe to
 * Redis, so the database connection count does not grow with the number of web instances. Delivery
 * is at-most-once, which is fine for live UI updates (clients refetch on reconnect). Reconnects
 * after a connection error instead of crashing the worker.
 */
export function startPgListen(options: PgListenOptions): { stop(): Promise<void> } {
  const log = options.log ?? (() => undefined);
  let client: pg.Client | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function connect(): Promise<void> {
    if (stopped) return;
    const next = new pg.Client({
      connectionString: options.connectionString,
      application_name: 'easemuse-listen',
    });
    client = next;
    next.on('notification', (message) => {
      if (message.channel !== PG_REALTIME_CHANNEL || !message.payload) return;
      try {
        const envelope = JSON.parse(message.payload) as RealtimeEnvelope;
        const forwarded = JSON.stringify({
          type: envelope.type,
          ids: envelope.ids,
          ts: envelope.ts,
        });
        options.redis
          .publish(redisChannel(envelope.channel), forwarded)
          .catch((error: Error) => log('pg_listen.publish_failed', { error: error.message }));
      } catch (error) {
        log('pg_listen.bad_payload', { error: (error as Error).message });
      }
    });
    next.on('error', (error) => {
      log('pg_listen.connection_error', { error: error.message });
      scheduleReconnect();
    });
    try {
      await next.connect();
      await next.query(`LISTEN ${PG_REALTIME_CHANNEL}`);
      log('pg_listen.started');
    } catch (error) {
      log('pg_listen.connect_failed', { error: (error as Error).message });
      scheduleReconnect();
    }
  }

  function scheduleReconnect(): void {
    if (stopped || timer) return;
    const old = client;
    client = null;
    old?.end().catch(() => undefined);
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, options.reconnectDelayMs ?? 5_000);
  }

  void connect();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await client?.end().catch(() => undefined);
    },
  };
}
