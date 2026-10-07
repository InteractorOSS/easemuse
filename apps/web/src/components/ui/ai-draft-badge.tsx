// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { useTranslations } from 'next-intl';
import { Badge } from './badge';

/**
 * Marks AI output that no recruiter has approved yet (brief §1.1: AI output is a draft until
 * approved). Show it on every unapproved AI artifact; it disappears only on approval.
 */
export function AiDraftBadge({ className }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <Badge variant="draft" className={className}>
      {t('aiDraft')}
    </Badge>
  );
}
