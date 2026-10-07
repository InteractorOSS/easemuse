// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { IntakeQuestionsEditor } from './intake-questions-editor';

/** /a/:agency/positions/:id/questions (US-104): run A2 on the approved JD, edit, approve. */
export function IntakeQuestionsView({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('positions.questions');
  const states = useTranslations('common.states');
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}/intake-questions`;
  const key = ['intake-questions', agencyId, positionId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<{ artifactId: string | null; approvedVersionId: string | null }>(base, { signal }),
  });
  const run = useAiRun(base, {
    onDone: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['artifact', agencyId] });
    },
  });
  const artifactId = query.data?.data.artifactId;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}`}>
          {t('back')}
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <p className="max-w-2xl text-sm text-muted">{t('hint')}</p>
        <div>
          <Button disabled={run.state.status === 'running'} onClick={() => void run.start()}>
            {artifactId ? t('rerun') : t('run')}
          </Button>
        </div>
      </div>
      <StreamingDraft state={run.state} onCancel={run.cancel} onRetry={() => void run.start()} />
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {artifactId ? (
        <ArtifactEditor
          agencyId={agencyId}
          artifactId={artifactId}
          ContentEditor={IntakeQuestionsEditor}
        />
      ) : null}
    </div>
  );
}
