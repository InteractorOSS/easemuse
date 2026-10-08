// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiFetch } from '@/lib/api-client';

interface PdfStatus {
  versionId: string | null;
  document: { fileId: string; createdAt: string; upToDate: boolean } | null;
}

/** The PDF of the approved submission report, rendered in the background (T-8-03). */
export function ReportExport({ agencyId, entryId }: { agencyId: string; entryId: string }) {
  const t = useTranslations('pipeline.report');
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/pipeline/${entryId}/submission-report/pdf`;
  const key = ['report-pdf', agencyId, entryId];
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const status = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<PdfStatus>(base, { signal }),
    refetchInterval: (q) => (requested && !q.state.data?.data.document?.upToDate ? 2000 : false),
  });
  const document = status.data?.data.document ?? null;
  const waiting = requested && !document?.upToDate;
  // The submission checklist counts this PDF, so it is refreshed when a new one is ready.
  const readyFileId = document?.upToDate ? document.fileId : null;
  useEffect(() => {
    if (readyFileId)
      void queryClient.invalidateQueries({ queryKey: ['submissions', agencyId, entryId] });
  }, [readyFileId, queryClient, agencyId, entryId]);
  const pdf = useMutation({
    mutationFn: () => apiFetch(base, { method: 'POST' }),
    onSuccess: async () => {
      setError(null);
      setRequested(true);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && e.status === 409 ? t('exportNotApproved') : t('exportError'),
      ),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <h3 className="font-medium">{t('pdfTitle')}</h3>
      <p className="text-sm text-muted">{t('pdfHint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={pdf.isPending || waiting}
          onClick={() => pdf.mutate()}
        >
          {document ? t('pdfAgain') : t('pdf')}
        </Button>
        {waiting ? <span role="status">{t('pdfWorking')}</span> : null}
        {document ? (
          <a className="underline" href={`/api/v1/agencies/${agencyId}/files/${document.fileId}`}>
            {t('pdfReady')}
          </a>
        ) : null}
      </div>
      {document && !document.upToDate && !waiting ? (
        <p className="text-sm text-warning">{t('pdfOutOfDate')}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
