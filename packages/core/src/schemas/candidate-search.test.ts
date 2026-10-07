// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { candidateSearchQuerySchema, toPrefixTsQuery } from '..';

describe('toPrefixTsQuery', () => {
  it('turns the words into prefix terms joined by AND', () => {
    expect(toPrefixTsQuery('HR Director payroll')).toBe('HR:* & Director:* & payroll:*');
    expect(toPrefixTsQuery('  hr   dir ')).toBe('hr:* & dir:*');
  });
  it('drops punctuation and query syntax, so user text cannot change the query', () => {
    expect(toPrefixTsQuery("a & b | !c ' ; (d)")).toBe('a:* & b:* & c:* & d:*');
    expect(toPrefixTsQuery("'; DROP TABLE x; --")).toBe('DROP:* & TABLE:* & x:*');
    expect(toPrefixTsQuery('foo:* <-> bar')).toBe('foo:* & bar:*');
  });
  it('keeps Korean words and numbers', () => {
    expect(toPrefixTsQuery('인사 팀장 2024')).toBe('인사:* & 팀장:* & 2024:*');
  });
  it('is null when there is nothing to search for', () => {
    expect(toPrefixTsQuery('')).toBeNull();
    expect(toPrefixTsQuery('   ')).toBeNull();
    expect(toPrefixTsQuery('&|!')).toBeNull();
    expect(toPrefixTsQuery(undefined)).toBeNull();
  });
  it('keeps at most ten words', () => {
    expect(toPrefixTsQuery('a b c d e f g h i j k l')!.split(' & ')).toHaveLength(10);
  });
});

describe('candidateSearchQuerySchema', () => {
  it('splits comma lists, trims them and coerces numbers', () => {
    expect(
      candidateSearchQuerySchema.parse({ skills: ' Go, SQL ,, ', tags: 'vip', minYears: '5' }),
    ).toEqual({ skills: ['Go', 'SQL'], tags: ['vip'], minYears: 5 });
  });
  it('rejects absurd years and too many skills', () => {
    expect(candidateSearchQuerySchema.safeParse({ minYears: '200' }).success).toBe(false);
    expect(
      candidateSearchQuerySchema.safeParse({
        skills: Array.from({ length: 30 }, (_, i) => `s${i}`).join(','),
      }).success,
    ).toBe(false);
  });
});
