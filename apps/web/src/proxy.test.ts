// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from './proxy';

describe('proxy (support access needs the real method)', () => {
  it('passes the real method and path on, whatever the client sent in those headers', () => {
    const response = proxy(
      new NextRequest('http://x.test/api/v1/agencies/acme/clients?q=1', {
        method: 'POST',
        headers: { 'x-easemuse-method': 'GET', 'x-easemuse-path': '/forged' },
      }),
    );
    expect(response.headers.get('x-middleware-request-x-easemuse-method')).toBe('POST');
    expect(response.headers.get('x-middleware-request-x-easemuse-path')).toBe(
      '/api/v1/agencies/acme/clients',
    );
    expect(response.headers.get('x-middleware-override-headers')).toContain('x-easemuse-method');
  });

  it('runs on pages and the API, but not on static assets', () => {
    const pattern = new RegExp(`^${config.matcher[0]!}$`);
    expect(pattern.test('/a/acme/candidates')).toBe(true);
    expect(pattern.test('/api/v1/me')).toBe(true);
    expect(pattern.test('/_next/static/chunk.js')).toBe(false);
  });
});
