// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { createChannelHub } from './channel-hub';

function fakeRedis() {
  const emitter = new EventEmitter() as EventEmitter & {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  };
  emitter.subscribe = vi.fn(async () => 1);
  emitter.unsubscribe = vi.fn(async () => 1);
  emitter.quit = vi.fn(async () => 'OK');
  return emitter;
}

describe('channel hub', () => {
  it('subscribes to Redis once per channel and fans out to every listener', async () => {
    const redis = fakeRedis();
    const hub = createChannelHub(redis as unknown as Redis);
    const a = vi.fn();
    const b = vi.fn();
    await hub.subscribe('job:1', a);
    await hub.subscribe('job:1', b);
    expect(redis.subscribe).toHaveBeenCalledTimes(1);
    expect(redis.subscribe).toHaveBeenCalledWith('em:rt:job:1');
    redis.emit('message', 'em:rt:job:1', 'hello');
    expect(a).toHaveBeenCalledWith('hello');
    expect(b).toHaveBeenCalledWith('hello');
  });

  it('keeps channels apart and ignores unknown ones', async () => {
    const redis = fakeRedis();
    const hub = createChannelHub(redis as unknown as Redis);
    const a = vi.fn();
    await hub.subscribe('job:1', a);
    redis.emit('message', 'em:rt:job:2', 'other');
    redis.emit('message', 'unrelated', 'other');
    expect(a).not.toHaveBeenCalled();
  });

  it('unsubscribes from Redis only after the last listener leaves', async () => {
    const redis = fakeRedis();
    const hub = createChannelHub(redis as unknown as Redis);
    const a = vi.fn();
    const b = vi.fn();
    const offA = await hub.subscribe('job:1', a);
    const offB = await hub.subscribe('job:1', b);
    await offA();
    expect(redis.unsubscribe).not.toHaveBeenCalled();
    redis.emit('message', 'em:rt:job:1', 'x');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    await offB();
    expect(redis.unsubscribe).toHaveBeenCalledWith('em:rt:job:1');
  });

  it('survives a throwing listener', async () => {
    const redis = fakeRedis();
    const hub = createChannelHub(redis as unknown as Redis);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const good = vi.fn();
    await hub.subscribe('job:1', () => {
      throw new Error('bad');
    });
    await hub.subscribe('job:1', good);
    redis.emit('message', 'em:rt:job:1', 'x');
    spy.mockRestore();
    expect(good).toHaveBeenCalled();
  });
});
