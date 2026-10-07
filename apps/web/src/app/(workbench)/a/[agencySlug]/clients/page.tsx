// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ClientsView } from '@/components/clients/clients-view';
import { agencyAccess } from '@/lib/auth/page-access';

/** Any member may see and add clients. */
export default async function ClientsPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <ClientsView agencyId={access.agency.id} />;
}
