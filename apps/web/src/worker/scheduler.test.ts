// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_JOBS,
  dailyIdempotencyKey,
  dueJobs,
  scheduleTick,
  startScheduler,
} from './scheduler';

const job = { queue: 'maintenance' as const, name: 'artifacts.orphan_report', hourUtc: 3 };

describe('daily scheduler', () => {
  it('runs the orphan report nightly', () => {
    expect(DAILY_JOBS).toContainEqual(job);
  });

  it('is due from its hour onward (UTC), not before', () => {
    expect(dueJobs(new Date('2026-10-07T02:59:00Z'), [job])).toEqual([]);
    expect(dueJobs(new Date('2026-10-07T03:00:00Z'), [job])).toEqual([job]);
    expect(dueJobs(new Date('2026-10-07T23:59:00Z'), [job])).toEqual([job]);
  });

  it('keys each day separately so the same day dedupes and the next day runs again', () => {
    expect(dailyIdempotencyKey(job, new Date('2026-10-07T03:10:00Z'))).toBe(
      'artifacts.orphan_report:2026-10-07',
    );
    expect(dailyIdempotencyKey(job, new Date('2026-10-07T20:00:00Z'))).toBe(
      'artifacts.orphan_report:2026-10-07',
    );
    expect(dailyIdempotencyKey(job, new Date('2026-10-08T03:10:00Z'))).toBe(
      'artifacts.orphan_report:2026-10-08',
    );
  });

  it('runs the reply check every ten minutes, keyed by the ten-minute slot', async () => {
    const replies = DAILY_JOBS.find((j) => j.name === 'mailbox.sync_replies')!;
    expect(replies.everyMinutes).toBe(10);
    expect(dueJobs(new Date('2026-10-07T00:01:00Z'), [replies])).toEqual([replies]);
    const key = (iso: string) => dailyIdempotencyKey(replies, new Date(iso));
    expect(key('2026-10-07T12:01:00Z')).toBe(key('2026-10-07T12:09:59Z'));
    expect(key('2026-10-07T12:09:59Z')).not.toBe(key('2026-10-07T12:10:00Z'));
  });

  it('enqueues due jobs as agency-less system jobs', async () => {
    const enqueue = vi.fn(async () => ({ deduplicated: false }));
    const result = await scheduleTick(new Date('2026-10-07T04:00:00Z'), enqueue, [job]);
    expect(result).toEqual([{ name: 'artifacts.orphan_report', deduplicated: false }]);
    expect(enqueue).toHaveBeenCalledWith({
      queue: 'maintenance',
      name: 'artifacts.orphan_report',
      agencyId: null,
      requestedById: null,
      idempotencyKey: 'artifacts.orphan_report:2026-10-07',
    });
  });

  it('enqueues nothing before the hour', async () => {
    const enqueue = vi.fn(async () => ({ deduplicated: false }));
    expect(await scheduleTick(new Date('2026-10-07T01:00:00Z'), enqueue, [job])).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('ticks on an interval, survives an enqueue failure and stops on request', async () => {
    vi.useFakeTimers();
    const enqueue = vi
      .fn()
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValue({ deduplicated: true });
    const log = vi.fn();
    const stop = startScheduler({
      enqueue,
      intervalMs: 1000,
      now: () => new Date('2026-10-07T05:00:00Z'),
      log,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toHaveBeenCalledWith('scheduler.error', { error: 'redis down' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(enqueue.mock.calls.length).toBeGreaterThanOrEqual(3);
    stop();
    const calls = enqueue.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(enqueue.mock.calls.length).toBe(calls);
    vi.useRealTimers();
  });
});
