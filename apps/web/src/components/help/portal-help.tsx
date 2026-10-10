// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PortalShell } from '@/components/portal/portal-shell';
import { isHelpTopic, type HelpAudience } from '@/lib/help/topics';
import { portalAgency } from '@/server/portal/page-access';
import { HelpArticle } from './help-article';
import { HelpIndex } from './help-index';

function BackLink({ prefix, slug }: { prefix: 'h' | 'c'; slug: string }) {
  const t = useTranslations('help');
  return (
    <p className="mt-6 text-sm">
      <Link href={`/${prefix}/${slug}`} className="underline">
        {t('backToPortal')}
      </Link>
    </p>
  );
}

/**
 * A help page inside a portal frame. The guides are the same for everyone and name no one, so they
 * need no session (a person who cannot sign in can still read how); the agency must exist and have
 * portals on, like every other portal page.
 */
export async function PortalHelp({
  prefix,
  slug,
  topic,
}: {
  prefix: 'h' | 'c';
  slug: string;
  topic?: string;
}) {
  const audience: HelpAudience = prefix === 'h' ? 'hiring_manager' : 'candidate';
  if (topic !== undefined && !isHelpTopic(audience, topic)) notFound();
  const agency = await portalAgency(slug);
  return (
    <PortalShell
      agencyName={agency.branding.displayName ?? agency.name}
      color={agency.branding.primaryColor}
      logoUrl={agency.logoUrl}
      slug={slug}
      prefix={prefix}
      signedIn={false}
    >
      {topic ? (
        <HelpArticle audience={audience} agencySlug={slug} topic={topic} />
      ) : (
        <HelpIndex audience={audience} agencySlug={slug} />
      )}
      <BackLink prefix={prefix} slug={slug} />
    </PortalShell>
  );
}
