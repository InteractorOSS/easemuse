// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { PrivacyRequests } from '@/components/settings/privacy-requests';
import { agencyAccess } from '@/lib/auth/page-access';

/** Candidate data-rights requests are for leads and admins; recruiters get a 404. */
export default async function PrivacyPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  if (access.role === 'recruiter') notFound();
  return <PrivacyRequests agencyId={access.agency.id} isAdmin={access.role === 'admin'} />;
}
