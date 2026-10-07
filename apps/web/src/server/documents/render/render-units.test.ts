// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { parseBranding } from '@easemuse/core';
import { canonicalJson, renderHash } from './hash';
import { createChromiumRenderer, findChromium } from './renderer';
import { signRenderToken, verifyRenderToken, RENDER_TOKEN_TTL_SEC } from './token';

const branding = parseBranding({});

describe('canonicalJson and renderHash', () => {
  it('ignores key order and undefined values', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe(
      canonicalJson({ a: { c: undefined, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
  });

  it('is stable for the same input and changes with content, branding, context or template', () => {
    const base = { kind: 'jd' as const, content: { a: 1 }, branding, context: { position: 'P' } };
    const hash = renderHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(renderHash({ ...base, content: { a: 1 } })).toBe(hash);
    expect(renderHash({ ...base, content: { a: 2 } })).not.toBe(hash);
    expect(renderHash({ ...base, branding: { ...branding, primaryColor: '#ff0000' } })).not.toBe(
      hash,
    );
    expect(renderHash({ ...base, context: { position: 'Q' } })).not.toBe(hash);
  });
});

describe('parseBranding', () => {
  it('fills defaults and falls back on invalid data instead of failing a render', () => {
    expect(parseBranding(null).primaryColor).toBe('#1f2937');
    expect(parseBranding({ primaryColor: 'red' }).primaryColor).toBe('#1f2937');
    expect(parseBranding({ primaryColor: '#00aa00', displayName: 'Acme Search' })).toMatchObject({
      primaryColor: '#00aa00',
      displayName: 'Acme Search',
    });
  });
});

describe('render token', () => {
  const input = { secret: 'test-secret', agencyId: 'a1', versionId: 'v1', now: 1_000_000_000_000 };
  it('verifies for the agency and version it was made for', () => {
    const token = signRenderToken(input);
    expect(verifyRenderToken({ ...input, token })).toBe(true);
  });
  it('is refused for another version, another agency, another secret, a tampered or missing token', () => {
    const token = signRenderToken(input);
    expect(verifyRenderToken({ ...input, versionId: 'v2', token })).toBe(false);
    expect(verifyRenderToken({ ...input, agencyId: 'a2', token })).toBe(false);
    expect(verifyRenderToken({ ...input, secret: 'other', token })).toBe(false);
    expect(
      verifyRenderToken({ ...input, token: token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')) }),
    ).toBe(false);
    expect(verifyRenderToken({ ...input, token: '' })).toBe(false);
    expect(verifyRenderToken({ ...input, token: undefined })).toBe(false);
    expect(verifyRenderToken({ ...input, token: 'x.y' })).toBe(false);
  });
  it('expires', () => {
    const token = signRenderToken(input);
    expect(
      verifyRenderToken({ ...input, token, now: input.now + (RENDER_TOKEN_TTL_SEC - 1) * 1000 }),
    ).toBe(true);
    expect(
      verifyRenderToken({ ...input, token, now: input.now + (RENDER_TOKEN_TTL_SEC + 5) * 1000 }),
    ).toBe(false);
  });
});

const chromium = await findChromium().catch(() => null);
describe.skipIf(!chromium)('Chromium renderer (needs the Playwright browser)', () => {
  it('prints a page to a PDF', async () => {
    const render = createChromiumRenderer({ executablePath: chromium ?? undefined });
    const pdf = await render(
      'data:text/html,<html><body><h1>Senior Engineer</h1><p>Hello</p></body></html>',
    );
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1000);
  }, 60_000);

  it('fails clearly when the page answers an error', async () => {
    const render = createChromiumRenderer({
      executablePath: chromium ?? undefined,
      timeoutMs: 5000,
    });
    await expect(render('http://127.0.0.1:1/never')).rejects.toBeDefined();
  }, 60_000);
});
