// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { BrandingForm } from '@/components/settings/branding-form';
import { agencyAccess } from '@/lib/auth/page-access';

/** Branding is for admins (FR-TEN-04); everyone else gets a 404. */
export default async function BrandingPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  if (access.role !== 'admin') notFound();
  return <BrandingForm agencyId={access.agency.id} agencySlug={access.agency.slug} canEdit />;
}
