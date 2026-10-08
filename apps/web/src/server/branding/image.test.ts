// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { TINY_JPEG, TINY_PNG } from '@/test/images';
import { readImageInfo } from './image';

describe('readImageInfo', () => {
  it('reads a PNG', () => {
    expect(readImageInfo(TINY_PNG)).toEqual({ contentType: 'image/png', width: 1, height: 1 });
  });
  it('reads a JPEG', () => {
    expect(readImageInfo(TINY_JPEG)).toEqual({ contentType: 'image/jpeg', width: 30, height: 20 });
  });
  it('refuses SVG, text, a truncated PNG and an empty file', () => {
    expect(
      readImageInfo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(readImageInfo(new TextEncoder().encode('hello'))).toBeNull();
    expect(readImageInfo(TINY_PNG.subarray(0, 12))).toBeNull();
    expect(readImageInfo(new Uint8Array())).toBeNull();
  });
});
