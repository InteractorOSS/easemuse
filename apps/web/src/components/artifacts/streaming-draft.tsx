// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { AiDraftBadge } from '@/components/ui/ai-draft-badge';
import { Button } from '@/components/ui/button';
import type { AiRunState } from './use-ai-run';

/**
 * Shows an AI draft while it is being written, with a way to stop it (FR-AI-07). The text is the raw
 * stream (partial JSON for structured drafts); the finished draft appears in the editor.
 */
export function StreamingDraft({
  state,
  onCancel,
  onRetry,
}: {
  state: AiRunState;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('artifacts.streaming');
  if (state.status === 'idle' || state.status === 'done') return null;
  return (
    <section aria-live="polite" className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex items-center gap-3">
        <AiDraftBadge />
        {state.status === 'running' ? <span role="status">{t('working')}</span> : null}
        {state.status === 'running' ? (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
      </div>
      {state.text ? (
        <pre className="max-h-64 overflow-auto text-xs whitespace-pre-wrap">{state.text}</pre>
      ) : null}
      {state.status === 'cancelled' ? <p>{t('cancelled')}</p> : null}
      {state.status === 'error' ? (
        <div role="alert" className="flex items-center gap-3 text-danger">
          <span>{t('failed', { reason: state.error ?? '' })}</span>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
