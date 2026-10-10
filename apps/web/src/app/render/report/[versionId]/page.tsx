// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { REPORT_SECTIONS, submissionReportContentSchema } from '@easemuse/core';
import { withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ApiError } from '@/lib/http/errors';
import { LogoMark } from '@/components/documents/logo-mark';
import { loadRenderSource } from '@/server/documents/render/service';
import { verifyRenderToken } from '@/server/documents/render/token';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The print template of an approved Candidate Submission Report (T-8-03, ADR-011, brief 10): the 14
 * sections with the agency branding. Only the render worker opens it: a signed, expiring token bound
 * to this agency and version is required, anything else is a 404.
 */
export default async function PrintReportPage({
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
    loadRenderSource(tx, agencyId, 'report', versionId),
  ).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!source) notFound();
  const t = await getTranslations('pipeline.report');
  const tq = await getTranslations('pipeline.qualification');
  const content = submissionReportContentSchema.parse(source.version.content);
  const { branding, context } = source;

  return (
    <main
      style={{ ['--brand' as string]: branding.primaryColor }}
      className="mx-auto max-w-3xl bg-white p-8 text-[11pt] leading-relaxed text-black"
    >
      <header
        className="mb-6 flex items-start gap-4 border-b-4 pb-3"
        style={{ borderColor: 'var(--brand)' }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            {branding.displayName ?? context.agency}
          </p>
          <h1 className="text-2xl font-bold">{t('printTitle')}</h1>
          {context.candidate ? <p className="text-lg">{context.candidate}</p> : null}
          {context.position ? (
            <p className="text-sm text-neutral-600">
              {[context.position.title, context.position.client, context.position.location].join(
                ' · ',
              )}
            </p>
          ) : null}
        </div>
        <LogoMark src={source.logoDataUri} name={branding.displayName ?? context.agency} />
      </header>

      {REPORT_SECTIONS.map((key) => (
        <section key={key} className="mb-4 break-inside-avoid">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand)' }}>
            {t(`sections.${key}`)}
          </h2>
          <p className="whitespace-pre-wrap">{content[key]}</p>
        </section>
      ))}
      {content.qualificationSummary.length > 0 ? (
        <section className="mb-4 break-inside-avoid">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand)' }}>
            {t('qualificationSummary')}
          </h2>
          <ul className="list-none p-0">
            {content.qualificationSummary.map((item) => (
              <li key={item.topic}>
                <span className="font-semibold">{`${tq(`topics.${item.topic}`)}: `}</span>
                {[item.value, item.level ? tq(`levels.${item.level}`) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mb-4 break-inside-avoid">
        <h2 className="text-base font-semibold" style={{ color: 'var(--brand)' }}>
          {t('assessment')}
        </h2>
        <p className="whitespace-pre-wrap">{content.recruiterAssessment}</p>
      </section>
    </main>
  );
}
