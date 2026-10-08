// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { BulkUpload } from '@/components/candidates/bulk-upload';
import { agencyAccess } from '@/lib/auth/page-access';

/** Upload up to 20 resumes at once; each becomes a draft to review (FR-SRC-10). Any member. */
export default async function BulkCandidatesPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <BulkUpload agencyId={access.agency.id} agencySlug={access.agency.slug} />;
}
