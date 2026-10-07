// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { QueryProvider } from '@/components/providers/query-provider';
import { agencyAccess } from '@/lib/auth/page-access';

/** Generic review surface for any draft; feature pages embed the same editor with their own form. */
export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ agencySlug: string; artifactId: string }>;
}) {
  const { agencySlug, artifactId } = await params;
  const access = await agencyAccess(agencySlug);
  return (
    <QueryProvider>
      <ArtifactEditor agencyId={access.agency.id} artifactId={artifactId} />
    </QueryProvider>
  );
}
