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
import type { RequirementView } from '@/server/positions/structured-jd';
import { StructuredJdEditor } from './structured-jd-editor';

interface Overview {
  artifactId: string | null;
  approvedVersionId: string | null;
  requirements: RequirementView[];
}

/** /a/:agency/positions/:id/structure (US-103): run A1, review the draft, approve it into requirements. */
export function StructureJdView({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('positions.structure');
  const categories = useTranslations('positions.categories');
  const states = useTranslations('common.states');
  const queryClient = useQueryClient();
  const key = ['structured-jd', agencyId, positionId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<Overview>(`/api/v1/agencies/${agencyId}/positions/${positionId}/structured-jd`, {
        signal,
      }),
  });
  const run = useAiRun(`/api/v1/agencies/${agencyId}/positions/${positionId}/jd/structure`, {
    onDone: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['artifact', agencyId] });
    },
  });
  const overview = query.data?.data;

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
            {overview?.artifactId ? t('rerun') : t('run')}
          </Button>
        </div>
      </div>

      <StreamingDraft state={run.state} onCancel={run.cancel} onRetry={() => void run.start()} />

      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {overview?.artifactId ? (
        <ArtifactEditor
          agencyId={agencyId}
          artifactId={overview.artifactId}
          ContentEditor={StructuredJdEditor}
        />
      ) : null}

      {overview ? (
        <section aria-labelledby="approved-reqs" className="flex flex-col gap-2">
          <h2 id="approved-reqs" className="text-lg font-semibold">
            {t('approvedRequirements')}
          </h2>
          {overview.requirements.length === 0 ? (
            <p className="text-sm text-muted">{t('noRequirements')}</p>
          ) : null}
          <ul className="flex flex-col gap-1 text-sm">
            {overview.requirements.map((r) => (
              <li key={r.id}>
                <strong>{categories(r.category as 'must_have')}</strong>
                {' · '}
                {r.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
