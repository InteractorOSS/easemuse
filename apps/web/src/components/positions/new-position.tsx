// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useRouter } from 'next/navigation';
import { PositionForm } from './position-form';

/** Creates a position, then opens its page. */
export function NewPosition({ agencyId, agencySlug }: { agencyId: string; agencySlug: string }) {
  const router = useRouter();
  return (
    <PositionForm
      agencyId={agencyId}
      onSaved={(position) => router.push(`/a/${agencySlug}/positions/${position.id}`)}
      onCancel={() => router.push(`/a/${agencySlug}/positions`)}
    />
  );
}
