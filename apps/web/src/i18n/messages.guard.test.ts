// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from './config';
import { NAMESPACES, type Messages } from './messages';

/** Guard (T-F-19): English is complete, other locales never invent keys, and every file is registered. */
const ROOT = path.resolve(__dirname, '../../messages');
const read = (locale: string, ns: string): Messages =>
  JSON.parse(readFileSync(path.join(ROOT, locale, `${ns}.json`), 'utf8'));

function leafKeys(tree: Messages, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : leafKeys(v, `${prefix}${k}.`),
  );
}

describe('message catalogs', () => {
  it('has a file per namespace for every locale', () => {
    for (const locale of LOCALES) {
      for (const ns of NAMESPACES)
        expect(existsSync(path.join(ROOT, locale, `${ns}.json`)), `${locale}/${ns}`).toBe(true);
    }
  });

  it('registers every file that exists on disk', () => {
    for (const locale of LOCALES) {
      const files = readdirSync(path.join(ROOT, locale))
        .map((f) => f.replace(/\.json$/, ''))
        .sort();
      expect(files).toEqual([...NAMESPACES].sort());
    }
  });

  it('has no empty English strings', () => {
    for (const ns of NAMESPACES) {
      for (const key of leafKeys(read('en', ns))) {
        const value = key.split('.').reduce<unknown>((o, k) => (o as Messages)[k], read('en', ns));
        expect((value as string).trim(), `en/${ns}.${key}`).not.toBe('');
      }
    }
  });

  it('only translates keys that exist in English', () => {
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      for (const ns of NAMESPACES) {
        const english = new Set(leafKeys(read('en', ns)));
        const stray = leafKeys(read(locale, ns)).filter((k) => !english.has(k));
        expect(stray, `${locale}/${ns}`).toEqual([]);
      }
    }
  });
});
