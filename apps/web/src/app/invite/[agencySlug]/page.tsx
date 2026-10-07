// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AcceptInvite } from '@/components/members/accept-invite';
import { auth } from '@/lib/auth';
import { getAgencyByRef } from '@/lib/db';

/**
 * Landing page of an invitation email. Signed-out visitors are sent to Interactor sign-in and come
 * back here; the token is only ever used by the accept call, which checks the email and expiry.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ agencySlug }, { token }] = await Promise.all([params, searchParams]);
  const t = await getTranslations('members.accept');

  const agency = await getAgencyByRef(agencySlug);
  if (!agency) notFound();

  if (!token) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <p role="alert">{t('missing')}</p>
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(`/invite/${agencySlug}?token=${token}`)}`,
    );
  }

  return (
    <main id="main" className="mx-auto max-w-lg p-8">
      <AcceptInvite agencySlug={agency.slug} agencyName={agency.name} token={token} />
    </main>
  );
}
