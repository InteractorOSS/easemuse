// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { applicationName, DEFAULT_POOL_SIZE, resolvePoolConfig } from './pool-config';

const connectionString = 'postgresql://easemuse_app@localhost:5432/easemuse_dev';

describe('resolvePoolConfig', () => {
  it('sizes the pool by process role', () => {
    expect(resolvePoolConfig({ connectionString, role: 'web' }).max).toBe(DEFAULT_POOL_SIZE.web);
    expect(resolvePoolConfig({ connectionString, role: 'worker' }).max).toBe(
      DEFAULT_POOL_SIZE.worker,
    );
  });

  it('lets an explicit size win', () => {
    expect(resolvePoolConfig({ connectionString, role: 'web', poolSize: 1 }).max).toBe(1);
  });

  it('names connections by role and bounds acquire time', () => {
    const config = resolvePoolConfig({ connectionString, role: 'worker' });
    expect(config.application_name).toBe(applicationName('worker'));
    expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  it('only enables SSL when asked', () => {
    expect(resolvePoolConfig({ connectionString, role: 'web' }).ssl).toBeUndefined();
    expect(resolvePoolConfig({ connectionString, role: 'web', ssl: true }).ssl).toBeTruthy();
  });
});
