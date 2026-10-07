// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Redis } from 'ioredis';
import { createRedis } from '../redis';
import { redisChannel } from './redis-channel';

export type HubListener = (message: string) => void;

/**
 * One Redis subscriber per web process, shared by every SSE connection. Each client-facing channel
 * is subscribed once and reference-counted, so a thousand open tabs cost one Redis subscription per
 * channel, not one connection each.
 */
export interface ChannelHub {
  subscribe(channel: string, listener: HubListener): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

export function createChannelHub(subscriber: Redis): ChannelHub {
  const listeners = new Map<string, Set<HubListener>>();
  const byRedisChannel = new Map<string, string>();

  subscriber.on('message', (redisName: string, message: string) => {
    const channel = byRedisChannel.get(redisName);
    if (!channel) return;
    for (const listener of listeners.get(channel) ?? []) {
      try {
        listener(message);
      } catch (error) {
        console.error('[hub] listener failed', (error as Error).message);
      }
    }
  });

  return {
    async subscribe(channel, listener) {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
        byRedisChannel.set(redisChannel(channel), channel);
        await subscriber.subscribe(redisChannel(channel));
      }
      set.add(listener);
      return async () => {
        const current = listeners.get(channel);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) {
          listeners.delete(channel);
          byRedisChannel.delete(redisChannel(channel));
          await subscriber.unsubscribe(redisChannel(channel)).catch(() => undefined);
        }
      };
    },
    async close() {
      listeners.clear();
      byRedisChannel.clear();
      await subscriber.quit().catch(() => undefined);
    },
  };
}

const globalForHub = globalThis as unknown as { easemuseHub?: ChannelHub };

export function getChannelHub(): ChannelHub {
  globalForHub.easemuseHub ??= createChannelHub(createRedis());
  return globalForHub.easemuseHub;
}
