// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ClientsView } from '@/components/clients/clients-view';
import { agencyAccess } from '@/lib/auth/page-access';

/** Any member may see and add clients. */
export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { agencySlug } = await params;
  const { q } = await searchParams;
  const access = await agencyAccess(agencySlug);
  return (
    <ClientsView
      agencyId={access.agency.id}
      initialSearch={typeof q === 'string' ? q.slice(0, 120) : ''}
    />
  );
}
