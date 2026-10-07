// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/db';
import { createRedis } from '@/lib/redis';
import { startPgListen } from '@/worker/pg-listen';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  dbAvailable,
  redisAvailable,
} from '@/test/db';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from '@/test/db-env';
import type { DbHandle } from '@/lib/db/client';
import { createChannelHub, type ChannelHub } from './channel-hub';
import { channels } from './channels';
import { publish, publishDetached } from './publish';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!dbAvailable() || !redisAvailable())(
  'realtime: pg_notify -> pg-listen -> Redis -> hub',
  () => {
    let admin: pg.Client;
    let handle: DbHandle;
    let pub: Redis;
    let sub: Redis;
    let hub: ChannelHub;
    let listener: { stop(): Promise<void> };
    let agency: string;
    const received: Record<string, unknown>[] = [];
    const channel = channels.job(randomUUID());

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      admin = await adminClient();
      handle = appHandle(2);
      agency = await createAgency(admin, 'R');
      pub = createRedis(TEST_REDIS_URL);
      sub = createRedis(TEST_REDIS_URL);
      hub = createChannelHub(sub);
      listener = startPgListen({ connectionString: TEST_DATABASE_URL, redis: pub });
      await hub.subscribe(channel, (message) => received.push(JSON.parse(message)));
      await sleep(300); // let LISTEN establish
    });

    afterAll(async () => {
      await listener.stop();
      await hub.close();
      await pub.quit();
      await cleanup(admin, { agencies: [agency] });
      await admin.end();
      await handle.close();
      await closeDb();
    });

    it('delivers a detached event to a subscribed channel', async () => {
      await publishDetached(channel, 'job.progress', { done: 1 });
      await expect.poll(() => received.length, { timeout: 4_000 }).toBeGreaterThan(0);
      expect(received[0]).toMatchObject({ type: 'job.progress', ids: { done: 1 } });
    });

    it('delivers an in-transaction event only after commit, and never for a rollback', async () => {
      const scope = appScope(handle);
      const before = received.length;
      await expect(
        scope.withAgency(agency, async (tx) => {
          await publish(tx, channel, 'rolled.back', {});
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      await scope.withAgency(agency, (tx) => publish(tx, channel, 'committed', {}));
      await expect
        .poll(() => received.some((m) => m.type === 'committed'), { timeout: 4_000 })
        .toBe(true);
      expect(received.slice(before).some((m) => m.type === 'rolled.back')).toBe(false);
    });

    it('does not deliver events for other channels', async () => {
      const before = received.length;
      await publishDetached(channels.job(randomUUID()), 'other', {});
      await sleep(400);
      expect(received.length).toBe(before);
    });
  },
);
