// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useState } from 'react';
import { CandidateIntakeForm } from '@/components/candidates/candidate-intake-form';
import { CandidateReview } from '@/components/candidates/candidate-review';

/**
 * Paste a LinkedIn profile on a position and get to a match analysis draft on one screen: paste or
 * upload, review the profile AI drafted (and any duplicate), then one confirm that saves the
 * candidate, adds them to the position and starts the analysis. Nothing is fetched from LinkedIn.
 */
export function PasteProfileFlow({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  return candidateId ? (
    <CandidateReview
      agencyId={agencyId}
      agencySlug={agencySlug}
      candidateId={candidateId}
      positionId={positionId}
    />
  ) : (
    <CandidateIntakeForm agencyId={agencyId} positionId={positionId} onCreated={setCandidateId} />
  );
}
