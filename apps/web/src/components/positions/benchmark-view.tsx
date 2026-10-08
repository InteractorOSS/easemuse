// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import type { ArtifactView } from '@/components/artifacts/types';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import type { BenchmarkView } from '@/server/benchmark/service';
import { BenchmarkContext, BenchmarkEditor } from './benchmark-editor';
import { BenchmarkSuggestions } from './benchmark-suggestions';

/**
 * /a/:agency/positions/:id/benchmark (US-108, brief 3.3): the market benchmark. "Our data" comes
 * from the agency's own earlier positions, "Web" from cited public pages; the report is a draft
 * until the recruiter approves it, and only then can its suggested JD changes be accepted.
 */
export function BenchmarkPage({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('intelligence.benchmark');
  const states = useTranslations('common.states');
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}/benchmark`;
  const key = ['benchmark', agencyId, positionId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<BenchmarkView>(base, { signal }),
  });
  const run = useAiRun(base, {
    onDone: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['artifact', agencyId] });
    },
  });
  const view = query.data?.data;
  const artifactId = view?.artifactId ?? null;

  // The editor approves through its own queries; when the artifact changes, refresh the decisions here.
  const artifact = useQuery({
    queryKey: ['artifact', agencyId, artifactId],
    queryFn: ({ signal }) =>
      apiFetch<ArtifactView>(`/api/v1/agencies/${agencyId}/artifacts/${artifactId}`, { signal }),
    enabled: Boolean(artifactId),
  });
  const changedAt = artifact.dataUpdatedAt;
  useEffect(() => {
    if (changedAt) void queryClient.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedAt]);

  const context = useMemo(
    () => ({ agencySlug, ourPositions: view?.ourPositions ?? {} }),
    [agencySlug, view?.ourPositions],
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}`}>
          {t('back')}
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <p className="max-w-2xl text-sm text-muted">{t('intro')}</p>
        {view ? (
          <p className="text-sm text-muted">{view.webSearchEnabled ? t('webOn') : t('webOff')}</p>
        ) : null}
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
        <BenchmarkContext.Provider value={context}>
          <ArtifactEditor
            agencyId={agencyId}
            artifactId={artifactId}
            ContentEditor={BenchmarkEditor}
          />
        </BenchmarkContext.Provider>
      ) : null}
      {view && view.content ? (
        <BenchmarkSuggestions
          agencyId={agencyId}
          agencySlug={agencySlug}
          positionId={positionId}
          view={view}
        />
      ) : null}
    </div>
  );
}
