// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { withAgency } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { getEnv } from '@/lib/env';
import { buildJdDocumentModel } from '@/server/documents/jd-document';
import { loadRenderSource } from '@/server/documents/render/service';
import { verifyRenderToken } from '@/server/documents/render/token';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The print template of an approved structured JD (T-1-12, ADR-011). Only the render worker opens
 * it: a signed, expiring token bound to this agency and version is required, anything else is a 404.
 */
export default async function PrintJdPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ agency?: string; token?: string }>;
}) {
  const { versionId } = await params;
  const { agency: agencyId, token } = await searchParams;
  const secret = getEnv().AUTH_SECRET;
  if (
    !secret ||
    !agencyId ||
    !z.guid().safeParse(agencyId).success ||
    !z.guid().safeParse(versionId).success
  )
    notFound();
  if (!verifyRenderToken({ secret, agencyId, versionId, token })) notFound();

  const source = await withAgency(agencyId, (tx) =>
    loadRenderSource(tx, agencyId, 'jd', versionId),
  ).catch((error: unknown) => {
    // A version that is not approved (or not there) is a plain 404; anything else is a real failure.
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!source) notFound();
  const sections = await getTranslations('positions.jdSections');
  const categories = await getTranslations('positions.categories');
  const t = await getTranslations('positions.print');
  const model = buildJdDocumentModel(source.version.content, {
    section: (key) => sections(key),
    category: (c) => categories(c),
  });
  const { branding, context } = source;

  return (
    <main
      style={{ ['--brand' as string]: branding.primaryColor }}
      className="mx-auto max-w-3xl bg-white p-8 text-[11pt] leading-relaxed text-black"
    >
      <header className="mb-6 border-b-4 pb-3" style={{ borderColor: 'var(--brand)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
          {branding.displayName ?? context.agency}
        </p>
        <h1 className="text-2xl font-bold">{context.position?.title ?? t('title')}</h1>
        {context.position ? (
          <p className="text-sm text-neutral-600">
            {context.position.client}
            {' · '}
            {context.position.location}
          </p>
        ) : null}
      </header>

      {model.sections.map((s) => (
        <section key={s.key} className="mb-4 break-inside-avoid">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand)' }}>
            {s.heading}
          </h2>
          <p className="whitespace-pre-wrap">{s.text}</p>
        </section>
      ))}

      {model.requirements.map((group) => (
        <section key={group.category} className="mb-4 break-inside-avoid">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand)' }}>
            {group.heading}
          </h2>
          <ul className="list-disc pl-5">
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
