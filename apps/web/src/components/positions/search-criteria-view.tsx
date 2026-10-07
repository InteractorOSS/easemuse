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
import { SearchCriteriaEditor } from './search-criteria-editor';

/** /a/:agency/positions/:id/search (US-201): run A6 on the confirmed profile, edit, approve, copy. */
export function SearchCriteriaView({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('positions.search');
  const states = useTranslations('common.states');
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}/search-criteria`;
  const key = ['search-criteria', agencyId, positionId];
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
          ContentEditor={SearchCriteriaEditor}
        />
      ) : null}
    </div>
  );
}
