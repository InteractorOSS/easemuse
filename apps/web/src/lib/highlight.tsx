// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { Fragment, type ReactNode } from 'react';

/** The words of a search box, as the server reads them (letters and digits only). */
export function searchTokens(query: string): string[] {
  return query
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 10);
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `text` with the start of each word that matches the search wrapped in <mark>, so a result shows
 * why it matched (US-207). Nothing is interpreted as HTML: parts are returned as React nodes.
 */
export function highlight(text: string, tokens: string[]): ReactNode {
  if (tokens.length === 0 || text === '') return text;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${tokens.map(escapeRegExp).join('|')})`, 'giu');
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(<mark key={start}>{match[0]}</mark>);
    last = start + match[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}
