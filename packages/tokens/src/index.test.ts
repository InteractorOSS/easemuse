// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { tokensToCss } from './index';

describe('tokensToCss', () => {
  it('emits kebab-case custom properties', () => {
    const css = tokensToCss({ color: { primaryForeground: '#fff' } });
    expect(css).toContain('--color-primary-foreground: #fff;');
  });
});
