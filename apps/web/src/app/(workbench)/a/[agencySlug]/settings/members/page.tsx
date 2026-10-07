// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { MembersView } from '@/components/members/members-view';
import { QueryProvider } from '@/components/providers/query-provider';
import { agencyAccess } from '@/lib/auth/page-access';

/** Admins manage members; leads can view the list; recruiters have no members page (404). */
export default async function MembersPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  if (access.role === 'recruiter') notFound();
  return (
    <QueryProvider>
      <MembersView agencyId={access.agency.id} canManage={access.role === 'admin'} />
    </QueryProvider>
  );
}
