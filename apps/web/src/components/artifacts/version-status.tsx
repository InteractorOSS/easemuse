// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { useTranslations } from 'next-intl';
import { AiDraftBadge } from '@/components/ui/ai-draft-badge';
import { Badge } from '@/components/ui/badge';

export interface VersionLike {
  status: 'draft' | 'approved' | 'superseded' | 'discarded';
  origin: 'ai' | 'human' | 'ai_edited';
}

/**
 * The badge for a version. Unapproved AI output always shows "AI draft" (brief §1.1); once the
 * recruiter has edited it, it reads "Edited draft", and approval replaces it with "Approved".
 */
export function VersionStatus({ version }: { version: VersionLike }) {
  const t = useTranslations('artifacts.status');
  if (version.status === 'approved') return <Badge>{t('approved')}</Badge>;
  if (version.status === 'superseded') return <Badge>{t('superseded')}</Badge>;
  if (version.status === 'discarded') return <Badge>{t('discarded')}</Badge>;
  if (version.origin === 'ai') return <AiDraftBadge />;
  return (
    <Badge variant="draft">
      {version.origin === 'ai_edited' ? t('draftEdited') : t('draftHuman')}
    </Badge>
  );
}
