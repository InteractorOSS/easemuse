// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { tailoredResumeContentSchema } from '@easemuse/core';
import { withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ApiError } from '@/lib/http/errors';
import { roleRange } from '@/server/documents/resume-docx';
import { loadRenderSource } from '@/server/documents/render/service';
import { verifyRenderToken } from '@/server/documents/render/token';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The print template of an approved tailored resume (T-7-03, ADR-011). Only the render worker opens
 * it: a signed, expiring token bound to this agency and version is required, anything else is a 404.
 */
export default async function PrintResumePage({
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
    loadRenderSource(tx, agencyId, 'resume', versionId),
  ).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!source) notFound();
  const t = await getTranslations('pipeline.resume');
  const content = tailoredResumeContentSchema.parse(source.version.content);
  const { branding } = source;
  const contact = [content.header.email, content.header.phone, content.header.location].filter(
    Boolean,
  );

  return (
    <main
      style={{ ['--brand' as string]: branding.primaryColor }}
      className="mx-auto max-w-3xl bg-white p-8 text-[11pt] leading-relaxed text-black"
    >
      <header className="mb-4 border-b-4 pb-3" style={{ borderColor: 'var(--brand)' }}>
        {content.header.name ? <h1 className="text-2xl font-bold">{content.header.name}</h1> : null}
        {content.headline ? (
          <p className="font-semibold" style={{ color: 'var(--brand)' }}>
            {content.headline}
          </p>
        ) : null}
        {contact.length ? (
          <p className="text-sm text-neutral-600">{contact.join('  |  ')}</p>
        ) : null}
      </header>
      {content.summary ? <p className="mb-4">{content.summary}</p> : null}

      {content.roles.length ? (
        <section className="mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand)' }}>
            {t('roles')}
          </h2>
          {content.roles.map((role, i) => (
            <div key={`${role.company}-${i}`} className="mt-2 break-inside-avoid">
              <p>
                <strong>{`${role.title}, ${role.company}`}</strong>{' '}
                <span className="text-sm text-neutral-600">{roleRange(role, t('present'))}</span>
              </p>
              <ul className="list-disc pl-5">
                {role.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {content.education.length ? (
        <section className="mb-4 break-inside-avoid">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand)' }}>
            {t('education')}
          </h2>
          {content.education.map((e, i) => (
            <p key={i}>{[e.degree, e.school, e.year].filter(Boolean).join(', ')}</p>
          ))}
        </section>
      ) : null}

      {content.skills.length ? (
        <section className="break-inside-avoid">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand)' }}>
            {t('skills')}
          </h2>
          <p>{content.skills.join(', ')}</p>
        </section>
      ) : null}
    </main>
  );
}
