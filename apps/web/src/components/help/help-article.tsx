// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toBlocks } from '@/lib/help/blocks';
import { HELP_BRIEF_SECTIONS, HELP_TOPICS, helpHref, type HelpAudience } from '@/lib/help/topics';

/** One help topic: title, what it is based on, a summary and the body written in the catalog. */
export function HelpArticle({
  audience,
  agencySlug,
  topic,
}: {
  audience: HelpAudience;
  agencySlug: string | null;
  topic: string;
}) {
  const t = useTranslations(`help.${audience}.${topic}`);
  const common = useTranslations('help');
  const root = useTranslations();
  const topics: readonly string[] = HELP_TOPICS[audience];
  const index = topics.indexOf(topic);
  const next = index >= 0 ? topics[index + 1] : undefined;
  const brief = HELP_BRIEF_SECTIONS[audience]?.[topic];
  return (
    <article className="max-w-3xl space-y-4">
      <nav aria-label={common('breadcrumb')} className="text-sm">
        <Link href={helpHref(audience, agencySlug)} className="underline">
          {common('allTopics')}
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {brief ? <p className="text-sm text-muted">{common('basedOn', { section: brief })}</p> : null}
      <p className="text-base">{t('summary')}</p>
      {toBlocks(t.raw('blocks')).map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h2 key={i} className="pt-2 text-lg font-semibold">
                {block.text}
              </h2>
            );
          case 'paragraph':
            return <p key={i}>{block.text}</p>;
          case 'note':
            return (
              <p key={i} className="rounded-md border border-border bg-surface p-3 text-sm">
                {block.text}
              </p>
            );
          case 'bullets':
            return (
              <ul key={i} className="list-disc space-y-1 pl-6">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case 'steps':
            return (
              <ol key={i} className="list-decimal space-y-1 pl-6">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ol>
            );
        }
      })}
      {next ? (
        <p className="pt-4 text-sm">
          <Link href={helpHref(audience, agencySlug, next)} className="underline">
            {common('next', { title: root(`help.${audience}.${next}.title`) })}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
