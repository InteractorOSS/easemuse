// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { DataExport } from '@/components/settings/data-export';
import { agencyAccess } from '@/lib/auth/page-access';

/** The full data export is for admins (FR-TEN-06); everyone else gets a 404. */
export default async function ExportPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  if (access.role !== 'admin') notFound();
  return <DataExport agencyId={access.agency.id} />;
}
