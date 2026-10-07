// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import { SuccessProfileEditor } from './success-profile-editor';

/** /a/:agency/positions/:id/profile (US-107): run A5, edit, confirm. */
export function SuccessProfileView({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('positions.profile');
  const states = useTranslations('common.states');
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}/success-profile`;
  const key = ['success-profile', agencyId, positionId];
  const [reason, setReason] = useState('');
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
  const guards = run.state.guards ?? [];
  const artifactId = query.data?.data.artifactId;
  const confirmed = Boolean(query.data?.data.approvedVersionId);
  const canOverride = guards.length > 0 && guards.every((g) => g.mode === 'warn');

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
        {query.isSuccess ? (
          <p className="text-sm">{confirmed ? t('confirmed', { n: '✓' }) : t('notConfirmed')}</p>
        ) : null}
        <div>
          <Button disabled={run.state.status === 'running'} onClick={() => void run.start()}>
            {artifactId ? t('rerun') : t('run')}
          </Button>
        </div>
      </div>

      {guards.length > 0 ? (
        <div
          role="alert"
          className="flex max-w-xl flex-col gap-2 rounded-md border border-border p-3 text-sm"
        >
          <p className="font-medium">{t('guardTitle')}</p>
          {canOverride ? (
            <>
              <p>{t('guardWarn')}</p>
              <TextField
                label={t('guardReason')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div>
                <Button
                  variant="secondary"
                  disabled={reason.trim().length < 3}
                  onClick={() =>
                    void run.start({
                      overrideGuards: [{ guard: 'jdApproval', reason: reason.trim() }],
                    })
                  }
                >
                  {t('guardGo')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted">{t('guardBlocked')}</p>
          )}
        </div>
      ) : null}

      <StreamingDraft state={run.state} onCancel={run.cancel} onRetry={() => void run.start()} />
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {artifactId ? (
        <ArtifactEditor
          agencyId={agencyId}
          artifactId={artifactId}
          ContentEditor={SuccessProfileEditor}
        />
      ) : null}
    </div>
  );
}
