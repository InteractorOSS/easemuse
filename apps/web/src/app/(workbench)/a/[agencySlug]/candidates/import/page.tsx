// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { CsvImport } from '@/components/candidates/csv-import';
import { agencyAccess } from '@/lib/auth/page-access';

/** Import candidates from a CSV with column mapping (T-2-15). Any member. */
export default async function ImportCandidatesPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <CsvImport agencyId={access.agency.id} agencySlug={access.agency.slug} />;
}
