// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** UI languages (ADR-015): English complete, Korean a skeleton that falls back to English. */
export const LOCALES = ['en', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Best supported language from an `Accept-Language` header, or null. */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? 1);
      return { base: tag.trim().toLowerCase().split('-')[0] ?? '', q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.map((entry) => entry.base).find(isLocale) ?? null;
}

/**
 * The UI locale: the user's own setting, else the agency default, else the browser's, else English
 * (ADR-015: "locale per user, default from the agency setting").
 */
export function resolveLocale(input: {
  userLocale?: string | null;
  agencyLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.userLocale)) return input.userLocale;
  if (isLocale(input.agencyLocale)) return input.agencyLocale;
  return fromAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}
