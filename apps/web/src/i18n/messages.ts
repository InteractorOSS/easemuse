// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Locale } from './config';

export type Messages = { [key: string]: string | Messages };

/** Namespaces: one JSON file per area under `messages/<locale>/`. Add a file, then list it here. */
export const NAMESPACES = [
  'common',
  'nav',
  'home',
  'workbench',
  'email',
  'admin',
  'members',
  'artifacts',
  'settings',
  'activity',
  'tasks',
  'clients',
  'positions',
  'candidates',
  'pipeline',
  'portal',
  'intelligence',
  'analytics',
] as const;

/** Overlays `override` on `base`: a key missing from the override keeps the base (English) text. */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] =
      typeof value === 'object' && typeof existing === 'object'
        ? mergeMessages(existing, value)
        : (value as string | Messages);
  }
  return out;
}

async function loadLocale(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    NAMESPACES.map(
      async (ns) => [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const,
    ),
  );
  return Object.fromEntries(entries) as Messages;
}

/** English is always the base, so an untranslated Korean string shows English, never a key. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const en = await loadLocale('en');
  return locale === 'en' ? en : mergeMessages(en, await loadLocale(locale));
}
