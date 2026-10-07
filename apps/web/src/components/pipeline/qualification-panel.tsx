// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { CallQuestionsEditor } from './call-questions-editor';
import { QualificationEditor } from './qualification-editor';

interface Overview {
  callQuestions: { artifactId: string; approvedVersionId: string | null } | null;
  qualification: { artifactId: string; approvedVersionId: string | null } | null;
}

/** Call questions and the call record for one candidate (brief 8, US-601, US-602). */
export function QualificationPanel({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.qualification');
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/pipeline/${entryId}`;
  const key = ['qualification', agencyId, entryId];
  const [notes, setNotes] = useState('');
  const overview = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<Overview>(`${url}/qualification`, { signal }),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ['artifact', agencyId] });
    await onChanged();
  };
  const questions = useAiRun(`${url}/call-questions`, { onDone: () => void refresh() });
  const structure = useAiRun(`${url}/qualification/structure`, {
    body: { notes },
    onDone: () => void refresh(),
  });
  const blank = useMutation({
    mutationFn: () => apiFetch(`${url}/qualification/blank`, { method: 'POST' }),
    onSuccess: refresh,
  });
  if (!overview.data) return null;
  const o = overview.data.data;

  return (
    <section aria-labelledby="qualification-heading" className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 id="qualification-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('hint')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">{t('questionsTitle')}</h3>
        <p className="text-sm text-muted">{t('questionsHint')}</p>
        <div>
          <Button
            size="sm"
            disabled={questions.state.status === 'running'}
            onClick={() => void questions.start()}
          >
            {o.callQuestions ? t('rewriteQuestions') : t('writeQuestions')}
          </Button>
        </div>
        <StreamingDraft
          state={questions.state}
          onCancel={questions.cancel}
          onRetry={() => void questions.start()}
        />
        {o.callQuestions ? (
          <ArtifactEditor
            agencyId={agencyId}
            artifactId={o.callQuestions.artifactId}
            ContentEditor={CallQuestionsEditor}
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">{t('recordTitle')}</h3>
        <div className="flex flex-col gap-1">
          <label htmlFor="call-notes" className="text-sm font-medium">
            {t('notes')}
          </label>
          <textarea
            id="call-notes"
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-md border border-border bg-background p-2 text-sm"
          />
          <p className="text-xs text-muted">{t('notesHint')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={notes.trim().length < 10 || structure.state.status === 'running'}
            onClick={() => void structure.start()}
          >
            {t('structure')}
          </Button>
          {o.qualification ? null : (
            <Button
              variant="secondary"
              size="sm"
              disabled={blank.isPending}
              onClick={() => blank.mutate()}
            >
              {t('blank')}
            </Button>
          )}
        </div>
        <StreamingDraft
          state={structure.state}
          onCancel={structure.cancel}
          onRetry={() => void structure.start()}
        />
        {o.qualification ? (
          <ArtifactEditor
            agencyId={agencyId}
            artifactId={o.qualification.artifactId}
            ContentEditor={QualificationEditor}
          />
        ) : null}
      </div>
    </section>
  );
}
