// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { DefaultsForm } from '@/components/settings/defaults-form';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function DefaultsPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <DefaultsForm agencyId={access.agency.id} canEdit={access.role === 'admin'} />;
}
