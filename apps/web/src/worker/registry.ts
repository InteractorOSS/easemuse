// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';
import type { QueueName } from '@/lib/queue/names';

/**
 * What a job handler receives. Database access to agency data goes ONLY through `withAgency`,
 * already bound to the job's agency (ADR-001): handlers open short transactions per step and never
 * hold one across an LLM call or a file render.
 */
export interface JobContext<D = unknown> {
  jobRunId: string;
  /** Null only for system-queue jobs; `withAgency` then throws. */
  agencyId: string | null;
  requestedById: string | null;
  data: D;
  /** 1-based attempt number. */
  attempt: number;
  withAgency<T>(fn: (tx: ScopedTx) => Promise<T>): Promise<T>;
  /** Records progress on the JobRun and publishes it on `job:<jobRunId>`. */
  progress(progress: Record<string, unknown>): Promise<void>;
}

export type JobHandler<D = unknown> = (ctx: JobContext<D>) => Promise<void>;

export class JobRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register<D>(queue: QueueName, name: string, handler: JobHandler<D>): this {
    const key = `${queue}:${name}`;
    if (this.handlers.has(key)) throw new Error(`Job handler already registered: ${key}`);
    this.handlers.set(key, handler as JobHandler);
    return this;
  }

  get(queue: QueueName, name: string): JobHandler | undefined {
    return this.handlers.get(`${queue}:${name}`);
  }
}

/** Handlers register here as modules add them (T-AI-*, T-1-05, ...). */
export const registry = new JobRegistry();
