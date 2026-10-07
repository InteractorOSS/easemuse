// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AcceptAdminInvite } from '@/components/admin/accept-admin-invite';
import { auth } from '@/lib/auth';

/** Landing page of a platform-administrator invitation: sign in, then accept. */
export default async function AdminInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations('admin.admins.accept');
  if (!token) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <p role="alert">{t('missing')}</p>
      </main>
    );
  }
  const session = await auth();
  if (!session?.user?.id)
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/admin-invite?token=${token}`)}`);
  return (
    <main id="main" className="mx-auto max-w-lg p-8">
      <AcceptAdminInvite token={token} />
    </main>
  );
}
