// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { OutboxList } from '@/components/settings/outbox-list';
import { agencyAccess } from '@/lib/auth/page-access';

/** The outbox is for admins (api-contracts section 6); everyone else gets a 404. */
export default async function OutboxPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  if (access.role !== 'admin') notFound();
  return <OutboxList agencyId={access.agency.id} />;
}
