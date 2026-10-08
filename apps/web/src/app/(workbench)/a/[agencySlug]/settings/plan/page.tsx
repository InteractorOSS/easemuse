// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { PlanAndSeats } from '@/components/settings/plan-and-seats';
import { agencyAccess } from '@/lib/auth/page-access';

/** Plan, seats and invoices are for admins (US-1308); everyone else gets a 404. */
export default async function PlanPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  if (access.role !== 'admin') notFound();
  return <PlanAndSeats agencyId={access.agency.id} />;
}
