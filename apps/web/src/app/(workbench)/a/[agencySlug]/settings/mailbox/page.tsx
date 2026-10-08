// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { MailboxView } from '@/components/settings/mailbox-view';
import { agencyAccess } from '@/lib/auth/page-access';

/** Connect your own Gmail or Microsoft 365 mailbox (T-5-12). Any member. */
export default async function MailboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string }>;
  searchParams: Promise<{ provider?: string; credential_id?: string }>;
}) {
  const { agencySlug } = await params;
  const { provider, credential_id: credentialId } = await searchParams;
  const access = await agencyAccess(agencySlug);
  return (
    <MailboxView
      agencyId={access.agency.id}
      agencySlug={access.agency.slug}
      returning={
        (provider === 'google' || provider === 'microsoft') && credentialId
          ? { provider, credentialId: credentialId.slice(0, 200) }
          : null
      }
    />
  );
}
