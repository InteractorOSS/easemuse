// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { fromAcceptLanguage, resolveLocale } from './config';
import { mergeMessages } from './messages';

describe('fromAcceptLanguage', () => {
  it('picks the best supported language by quality', () => {
    expect(fromAcceptLanguage('fr;q=0.9, ko-KR;q=0.8, en;q=0.5')).toBe('ko');
    expect(fromAcceptLanguage('en-US,en;q=0.9,ko;q=0.8')).toBe('en');
  });
  it('returns null for unsupported, empty or zero-quality input', () => {
    expect(fromAcceptLanguage('fr, de')).toBeNull();
    expect(fromAcceptLanguage('ko;q=0')).toBeNull();
    expect(fromAcceptLanguage(null)).toBeNull();
    expect(fromAcceptLanguage('')).toBeNull();
  });
});

describe('resolveLocale', () => {
  it('prefers user, then agency, then browser, then English', () => {
    expect(resolveLocale({ userLocale: 'ko', agencyLocale: 'en', acceptLanguage: 'en' })).toBe(
      'ko',
    );
    expect(resolveLocale({ userLocale: null, agencyLocale: 'ko', acceptLanguage: 'en' })).toBe(
      'ko',
    );
    expect(resolveLocale({ agencyLocale: null, acceptLanguage: 'ko' })).toBe('ko');
    expect(resolveLocale({})).toBe('en');
  });
  it('ignores unsupported stored values', () => {
    expect(resolveLocale({ userLocale: 'xx', agencyLocale: 'yy', acceptLanguage: 'ko' })).toBe(
      'ko',
    );
  });
});

describe('mergeMessages', () => {
  it('keeps English for keys the override lacks, at any depth', () => {
    const merged = mergeMessages({ a: 'A', n: { x: 'X', y: 'Y' } }, { n: { y: '와이' } });
    expect(merged).toEqual({ a: 'A', n: { x: 'X', y: '와이' } });
  });
});
