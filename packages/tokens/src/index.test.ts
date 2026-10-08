// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { tokens, tokensToCss, tokensToTheme } from './index';

describe('tokens', () => {
  it('emits kebab-case custom properties', () => {
    const css = tokensToCss({ color: { primaryForeground: '#fff' } });
    expect(css).toContain('--color-primary-foreground: #fff;');
    expect(css.startsWith(':root {')).toBe(true);
  });

  it('wraps the same declarations in a Tailwind @theme block', () => {
    expect(tokensToTheme({ radius: { sm: '4px' } })).toBe('@theme {\n  --radius-sm: 4px;\n}\n');
  });

  it('keeps text on the page background at WCAG AA contrast (4.5:1)', () => {
    const luminance = (hex: string) => {
      const channel = (i: number) => {
        const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const c = tokens.color;
    expect(ratio(c.foreground, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c.muted, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c.primaryForeground, c.primary)).toBeGreaterThanOrEqual(4.5);
    // Green used as text, borders and focus rings on the page (WCAG 1.4.3 text, 1.4.11 non-text).
    expect(ratio(c.primaryStrong, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c.dangerForeground, c.danger)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c.draftBadge, c.draftBadgeBackground)).toBeGreaterThanOrEqual(4.5);
  });
});
