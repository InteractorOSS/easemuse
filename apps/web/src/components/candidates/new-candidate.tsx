// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useRouter } from 'next/navigation';
import { CandidateIntakeForm } from './candidate-intake-form';

/** Adds a candidate, then opens the review page while the file is read. */
export function NewCandidate({ agencyId, agencySlug }: { agencyId: string; agencySlug: string }) {
  const router = useRouter();
  return (
    <CandidateIntakeForm
      agencyId={agencyId}
      onCreated={(id) => router.push(`/a/${agencySlug}/candidates/${id}/review`)}
    />
  );
}
