// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import type { ContentEditorProps } from '@/components/artifacts/types';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { PatternSummaryEditor } from './pattern-summary-editor';

/** A18 (FR-KNW-03): the recruiter asks for a summary; it arrives as a draft with the records behind each sentence. */
export function PatternSummaryPanel({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('knowledge.summary');
  const states = useTranslations('common.states');
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}/pattern-summary`;
  const key = ['pattern-summary', agencyId, positionId];
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
  const Editor = useCallback(
    (props: ContentEditorProps) => <PatternSummaryEditor {...props} agencySlug={agencySlug} />,
    [agencySlug],
  );
  const artifactId = query.data?.data.artifactId;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-3xl flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted">{t('intro')}</p>
        <div>
          <Button disabled={run.state.status === 'running'} onClick={() => void run.start()}>
            {artifactId ? t('rerun') : t('run')}
          </Button>
        </div>
        {run.state.status === 'running' ? <p role="status">{t('running')}</p> : null}
        {run.state.status === 'error' ? (
          <p role="alert" className="text-sm text-danger">
            {run.state.error ?? t('error')}
          </p>
        ) : null}
      </div>
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && !artifactId ? <p className="text-muted">{t('none')}</p> : null}
      {artifactId ? (
        <ArtifactEditor agencyId={agencyId} artifactId={artifactId} ContentEditor={Editor} />
      ) : null}
    </div>
  );
}
