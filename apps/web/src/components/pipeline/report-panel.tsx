// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { ReportEditor } from './report-editor';
import { ReportExport } from './report-export';

interface Overview {
  artifactId: string | null;
  approvedVersionId: string | null;
}

/** Drafts and edits the Candidate Submission Report: draft, fact check, assessment, approve (brief 10). */
export function ReportPanel({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.report');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/pipeline/${entryId}/submission-report`;
  const key = ['submission-report', agencyId, entryId];
  const overview = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<Overview>(url, { signal }),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ['artifact', agencyId] });
    await onChanged();
  };
  const run = useAiRun(url, { onDone: () => void refresh() });
  const recheck = useMutation({
    mutationFn: () => apiFetch(`${url}/fact-check`, { method: 'POST' }),
    onSuccess: async () => {
      toast({ title: t('rechecked') });
      await queryClient.invalidateQueries({ queryKey: ['artifact', agencyId] });
    },
  });
  if (!overview.data) return null;
  const o = overview.data.data;

  return (
    <section aria-labelledby="report-heading" className="flex max-w-4xl flex-col gap-4">
      <div>
        <h2 id="report-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('hint')}</p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={run.state.status === 'running'}
          onClick={() => void run.start()}
        >
          {o.artifactId ? t('again') : t('draft')}
        </Button>
        {o.artifactId ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={recheck.isPending}
            onClick={() => recheck.mutate()}
          >
            {t('recheck')}
          </Button>
        ) : null}
      </div>
      <StreamingDraft state={run.state} onCancel={run.cancel} onRetry={() => void run.start()} />
      {o.artifactId ? (
        <ArtifactEditor
          agencyId={agencyId}
          artifactId={o.artifactId}
          ContentEditor={ReportEditor}
          onChanged={() => queryClient.invalidateQueries({ queryKey: key })}
        />
      ) : null}
      {o.approvedVersionId ? <ReportExport agencyId={agencyId} entryId={entryId} /> : null}
    </section>
  );
}
