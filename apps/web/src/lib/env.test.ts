// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env';

const base = { DATABASE_URL: 'postgresql://easemuse_app@localhost:5432/easemuse_dev' };

const prodSecrets = {
  INTERACTOR_AUTH_CLIENT_ID: 'id',
  INTERACTOR_AUTH_CLIENT_SECRET: 'secret',
  AUTH_SECRET: 'auth',
  ANTHROPIC_API_KEY: 'a',
  VOYAGE_API_KEY: 'v',
  S3_BUCKET: 'b',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
  MAIL_FROM: 'noreply@example.com',
};

describe('parseEnv', () => {
  it('applies defaults in development', () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      PROCESS_ROLE: 'web',
      REDIS_URL: 'redis://localhost:6379',
    });
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
  });

  it('treats blank values as unset', () => {
    const env = parseEnv({ ...base, ANTHROPIC_API_KEY: '  ', PORT: '' });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.PORT).toBe(3000);
  });

  it('coerces numbers and rejects bad values, listing every issue', () => {
    expect(parseEnv({ ...base, DATABASE_POOL_SIZE: '12' }).DATABASE_POOL_SIZE).toBe(12);
    try {
      parseEnv({ DATABASE_URL: '', PORT: 'abc', PROCESS_ROLE: 'cron' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as EnvError).message;
      expect(message).toContain('PORT');
      expect(message).toContain('PROCESS_ROLE');
      expect(message).toContain('DATABASE_URL');
    }
  });

  it('requires integration secrets in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/AUTH_SECRET: required/);
    expect(parseEnv({ ...base, ...prodSecrets, NODE_ENV: 'production' }).NODE_ENV).toBe(
      'production',
    );
  });
});
