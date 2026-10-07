// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Route classification rules (T-F-13, ADR-012). Every `route.ts` under src/app/api declares its
 * audience in a header comment, `// route-audience: <audience>` (Next.js rejects extra exports from
 * route files, so a comment is the marker). The guard then checks the declaration against the URL
 * prefix and against the auth wrapper the file actually calls.
 */
export const AUDIENCES = ['agency', 'portal', 'admin', 'user', 'public'] as const;
export type Audience = (typeof AUDIENCES)[number];

const WRITE_METHOD =
  /export\s+(?:async\s+)?(?:function|const)\s+(?:POST|PUT|PATCH|DELETE)\b|export\s*\{[^}]*\b(?:POST|PUT|PATCH|DELETE)\b/;

/** Audience each URL prefix must declare; routes outside every prefix may be `user` or `public`. */
const PREFIX_AUDIENCE: [prefix: string, audience: Audience][] = [
  ['api/v1/agencies/', 'agency'],
  ['api/admin/v1/', 'admin'],
  ['api/portal/v1/', 'portal'],
  ['api/v1/me', 'user'],
  ['api/v1/invites/', 'user'],
];

const REQUIRED_CALL: Record<Exclude<Audience, 'public'>, RegExp> = {
  agency: /\b(?:authorizeAgency|requireAgency)\(/,
  admin: /\b(?:authorizePlatformAdmin|requirePlatformAdmin)\(/,
  portal: /\bauthorizePortal\(/,
  user: /\b(?:authorizeUser|requireUser)\(/,
};

export function declaredAudience(source: string): string | null {
  const head = source.split('\n').slice(0, 12).join('\n');
  return /^\/\/\s*route-audience:\s*(\w+)/m.exec(head)?.[1] ?? null;
}

/** A public write route needs a limiter, or an explicit, reasoned exemption in the header. */
export function hasRateLimitOrExemption(source: string): boolean {
  return /\brateLimit\(/.test(source) || /^\/\/\s*rate-limit:\s*exempt\s*\(.+\)/m.test(source);
}

/** Returns human-readable problems for one route file; empty when it is correctly classified. */
export function classifyRoute(routePath: string, source: string): string[] {
  const problems: string[] = [];
  const declared = declaredAudience(source);
  if (!declared)
    return [`${routePath}: missing "// route-audience: <${AUDIENCES.join('|')}>" header`];
  if (!(AUDIENCES as readonly string[]).includes(declared)) {
    return [`${routePath}: unknown audience "${declared}"`];
  }
  const audience = declared as Audience;

  const expected = PREFIX_AUDIENCE.find(([prefix]) => routePath.startsWith(prefix))?.[1];
  if (expected && audience !== expected) {
    problems.push(`${routePath}: lives under a ${expected} prefix but declares "${audience}"`);
  }
  if (!expected && audience !== 'user' && audience !== 'public') {
    problems.push(`${routePath}: "${audience}" routes must live under their own URL prefix`);
  }

  if (audience === 'public') {
    if (WRITE_METHOD.test(source) && !hasRateLimitOrExemption(source)) {
      problems.push(
        `${routePath}: public write route needs rateLimit() or "// rate-limit: exempt (reason)"`,
      );
    }
  } else if (!REQUIRED_CALL[audience].test(source)) {
    problems.push(`${routePath}: declares "${audience}" but never calls its authorizer`);
  }
  return problems;
}
