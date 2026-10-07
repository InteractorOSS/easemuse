// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { classifyRoute } from './route-classification';

const withHeader = (audience: string, body = '') =>
  `// Copyright\n// route-audience: ${audience}\n${body}`;

describe('classifyRoute', () => {
  it('flags a route with no declaration', () => {
    expect(classifyRoute('api/v1/me', 'export async function GET() {}')[0]).toMatch(/missing/);
  });

  it('flags an unknown audience', () => {
    expect(classifyRoute('api/v1/me', withHeader('everyone'))[0]).toMatch(/unknown audience/);
  });

  it('requires the audience to match the URL prefix', () => {
    const src = withHeader('user', 'authorizeUser()');
    expect(classifyRoute('api/v1/agencies/[id]/clients', src)[0]).toMatch(/agency prefix/);
    expect(classifyRoute('api/admin/v1/agencies', src)[0]).toMatch(/admin prefix/);
  });

  it('requires the matching authorizer call', () => {
    expect(classifyRoute('api/v1/agencies/[id]/x', withHeader('agency', 'noop()'))[0]).toMatch(
      /never calls/,
    );
    expect(
      classifyRoute('api/v1/agencies/[id]/x', withHeader('agency', 'await authorizeAgency(id)')),
    ).toEqual([]);
    expect(
      classifyRoute('api/admin/v1/x', withHeader('admin', 'await authorizePlatformAdmin()')),
    ).toEqual([]);
    expect(classifyRoute('api/portal/v1/x', withHeader('portal', 'authorizePortal(req)'))).toEqual(
      [],
    );
  });

  it('requires a limiter or reasoned exemption on public write routes', () => {
    const write = 'export async function POST() {}';
    expect(classifyRoute('api/hook', withHeader('public', write))[0]).toMatch(/rateLimit/);
    expect(
      classifyRoute('api/hook', withHeader('public', `${write}\nawait rateLimit(req, o)`)),
    ).toEqual([]);
    expect(
      classifyRoute(
        'api/auth/x',
        `// route-audience: public\n// rate-limit: exempt (Auth.js)\n${write}`,
      ),
    ).toEqual([]);
    expect(
      classifyRoute('api/health', withHeader('public', 'export async function GET() {}')),
    ).toEqual([]);
  });

  it('does not let a non-prefixed route claim agency or admin', () => {
    expect(classifyRoute('api/other', withHeader('agency', 'authorizeAgency(x)'))[0]).toMatch(
      /own URL prefix/,
    );
  });
});
