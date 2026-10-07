// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  employerKey,
  employerKeys,
  nameSimilarity,
  normalizeEmail,
  phoneKey,
  profileUrlKey,
} from './keys';

describe('normalizeEmail', () => {
  it('lowercases and trims, and rejects what is not an address', () => {
    expect(normalizeEmail('  Alex.Kim@Example.COM ')).toBe('alex.kim@example.com');
    expect(normalizeEmail('not an email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('phoneKey', () => {
  it('gives the same key however the number is written', () => {
    const expected = '1012345678';
    for (const p of [
      '+82 10-1234-5678',
      '010 1234 5678',
      '01012345678',
      '(010) 1234.5678',
      '+82-(0)10-1234-5678'.replace('(0)', ''),
    ]) {
      expect(phoneKey(p)).toBe(expected);
    }
  });
  it('compares the national number across country codes by the last ten digits', () => {
    expect(phoneKey('+1 415 555 0123')).toBe('4155550123');
    expect(phoneKey('(415) 555-0123')).toBe('4155550123');
  });
  it('refuses numbers too short to identify anyone', () => {
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey('')).toBeNull();
    expect(phoneKey(undefined)).toBeNull();
  });
});

describe('profileUrlKey', () => {
  it('ignores scheme, www, query, fragment, case and trailing slash', () => {
    const key = 'linkedin.com/in/alex-kim';
    for (const u of [
      'https://www.linkedin.com/in/Alex-Kim/?utm_source=x',
      'linkedin.com/in/alex-kim',
      'http://kr.linkedin.com/in/alex-kim/#about',
      'https://www.linkedin.com/in/alex-kim/details/experience',
    ]) {
      expect(profileUrlKey(u)).toBe(key);
    }
  });
  it('keeps other sites distinct by host and path', () => {
    expect(profileUrlKey('https://github.com/alexkim')).toBe('github.com/alexkim');
    expect(profileUrlKey('https://www.github.com/alexkim/')).toBe('github.com/alexkim');
    expect(profileUrlKey('https://github.com/other')).not.toBe(
      profileUrlKey('https://github.com/alexkim'),
    );
  });
  it('is null for nothing or nonsense', () => {
    expect(profileUrlKey('')).toBeNull();
    expect(profileUrlKey(null)).toBeNull();
    expect(profileUrlKey('http://')).toBeNull();
  });
});

describe('employer keys', () => {
  it('ignores case, punctuation and legal suffixes, in English and Korean', () => {
    expect(employerKey('Acme, Inc.')).toBe('acme');
    expect(employerKey('ACME Corp')).toBe('acme');
    expect(employerKey('Northwind Traders LLC')).toBe('northwindtraders');
    expect(employerKey('주식회사 삼성전자')).toBe('삼성전자');
    expect(employerKey('(주)네이버')).toBe('네이버');
  });
  it('drops empty and too-short names and removes duplicates', () => {
    expect(employerKey('X')).toBeNull();
    expect(employerKey('  ')).toBeNull();
    expect(employerKeys(['Acme Inc', 'ACME', null, undefined, 'Contoso'])).toEqual([
      'acme',
      'contoso',
    ]);
  });
});

describe('nameSimilarity', () => {
  it('is 1 for the same name in another order or punctuation', () => {
    expect(nameSimilarity('Alex Kim', 'Kim, Alex')).toBe(1);
    expect(nameSimilarity('alex kim', 'ALEX  KIM')).toBe(1);
  });
  it('stays high for a one-letter typo and low for different people', () => {
    expect(nameSimilarity('Alex Kim', 'Alex Kimm')).toBeGreaterThan(0.85);
    expect(nameSimilarity('Alex Kim', 'Jamie Park')).toBeLessThan(0.5);
  });
  it('compares Korean names written with or without a space', () => {
    expect(nameSimilarity('김민수', '김 민수')).toBe(1);
    expect(nameSimilarity('김민수', '박지훈')).toBeLessThan(0.5);
  });
  it('is 0 when either name is empty', () => {
    expect(nameSimilarity('', 'Alex')).toBe(0);
    expect(nameSimilarity('Alex', null)).toBe(0);
  });
});
