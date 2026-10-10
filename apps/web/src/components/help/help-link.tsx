// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  agencySlugForPath,
  helpHref,
  isHelpTopic,
  topicForPath,
  type HelpAudience,
} from '@/lib/help/topics';
import { cn } from '@/lib/utils';

const LINK_CLASS = 'underline underline-offset-2 hover:text-foreground';

/**
 * A link to one help topic. `topic` is a topic of `audience` (see lib/help/topics.ts); an unknown
 * topic falls back to the help index so a typo never leaves a dead link.
 */
export function HelpLink({
  audience,
  agencySlug,
  topic,
  className,
}: {
  audience: HelpAudience;
  /** The agency in the address; not used for the platform admin area. */
  agencySlug?: string | null;
  topic?: string;
  className?: string;
}) {
  const t = useTranslations('help');
  const known = topic && isHelpTopic(audience, topic) ? topic : undefined;
  return (
    <Link
      href={helpHref(audience, agencySlug ?? null, known)}
      className={cn(LINK_CLASS, className)}
      data-help-topic={known ?? 'index'}
    >
      {t('link')}
    </Link>
  );
}

/**
 * The help link a page frame shows: it picks the topic that fits the page being viewed, so every
 * page in the workbench, the portals and /admin links to its own help without each page asking.
 */
export function PageHelpLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const found = topicForPath(pathname);
  if (!found) return null;
  return (
    <HelpLink
      audience={found.audience}
      agencySlug={agencySlugForPath(pathname)}
      topic={found.topic}
      {...(className ? { className } : {})}
    />
  );
}
