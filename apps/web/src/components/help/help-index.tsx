// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { HELP_TOPICS, helpHref, type HelpAudience } from '@/lib/help/topics';

/** The list of help topics for one audience, with a one-line summary each. */
export function HelpIndex({
  audience,
  agencySlug,
}: {
  audience: HelpAudience;
  agencySlug: string | null;
}) {
  const t = useTranslations(`help.${audience}`);
  const common = useTranslations('help');
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{common(`${audience}Title`)}</h1>
      <p>{common(`${audience}Intro`)}</p>
      <ul className="space-y-3">
        {HELP_TOPICS[audience].map((topic) => (
          <li key={topic}>
            <Link href={helpHref(audience, agencySlug, topic)} className="font-medium underline">
              {t(`${topic}.title`)}
            </Link>
            <p className="text-sm text-muted">{t(`${topic}.summary`)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
