// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { highlight, searchTokens } from './highlight';

const html = (node: React.ReactNode) => render(<p>{node}</p>).container.innerHTML;

describe('searchTokens', () => {
  it('reads letters and digits only, like the server', () => {
    expect(searchTokens("HR  Director, payroll! 'x'")).toEqual(['HR', 'Director', 'payroll', 'x']);
    expect(searchTokens('인사 팀장')).toEqual(['인사', '팀장']);
    expect(searchTokens('&|!')).toEqual([]);
  });
});

describe('highlight', () => {
  it('marks the start of each matching word, ignoring case', () => {
    expect(html(highlight('Senior HR Director', ['hr', 'dir']))).toBe(
      '<p>Senior <mark>HR</mark> <mark>Dir</mark>ector</p>',
    );
  });
  it('does not mark the middle of a word', () => {
    expect(html(highlight('Chairman', ['air']))).toBe('<p>Chairman</p>');
  });
  it('treats regular-expression characters in the search as plain text', () => {
    expect(html(highlight('C++ developer', ['c++']))).toBe('<p><mark>C++</mark> developer</p>');
    expect(html(highlight('Senior (staff) engineer', ['(staff', '[x']))).toContain('<mark>');
    expect(html(highlight('a.b', ['.']))).toBe('<p>a.b</p>'); // a dot is not "any character"
  });
  it('never turns text into markup', () => {
    expect(html(highlight('<img src=x onerror=alert(1)> payroll', ['payroll']))).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt; <mark>payroll</mark></p>',
    );
  });
  it('returns the text unchanged when there is nothing to mark', () => {
    expect(highlight('Alex Kim', [])).toBe('Alex Kim');
    expect(highlight('Alex Kim', ['zzz'])).toBe('Alex Kim');
    expect(highlight('', ['a'])).toBe('');
  });
  it('marks Korean words', () => {
    expect(html(highlight('인사팀 팀장', ['인사']))).toBe('<p><mark>인사</mark>팀 팀장</p>');
  });
});
