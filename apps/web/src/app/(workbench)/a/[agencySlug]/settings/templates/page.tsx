// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { TemplatesView } from '@/components/settings/templates-view';
import { agencyAccess } from '@/lib/auth/page-access';

/** Message templates: every member has their own; leads and admins also share them. */
export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <TemplatesView agencyId={access.agency.id} canShare={access.role !== 'recruiter'} />;
}
