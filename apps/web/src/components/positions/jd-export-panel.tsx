// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiFetch } from '@/lib/api-client';

interface PdfStatus {
  versionId: string | null;
  document: { fileId: string; createdAt: string; upToDate: boolean } | null;
}

/** Export of the approved JD (US-105): a Word file at once, a PDF rendered in the background. */
export function JdExportPanel({ agencyId, positionId }: { agencyId: string; positionId: string }) {
  const t = useTranslations('positions.export');
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}/jd/export`;
  const key = ['jd-export', agencyId, positionId];
  const [error, setError] = useState<string | null>(null);
  // Set when a PDF was asked for. Waiting lasts until a PDF that matches the approved JD exists.
  const [requested, setRequested] = useState(false);

  const status = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<PdfStatus>(base, { signal }),
    // After "Create PDF", keep checking until the new file shows up.
    refetchInterval: (q) => (requested && !q.state.data?.data.document?.upToDate ? 2000 : false),
  });
  const document = status.data?.data.document ?? null;
  const waiting = requested && !document?.upToDate;

  const explain = (e: unknown) =>
    e instanceof ApiClientError && e.status === 409 ? t('errors.notApproved') : t('errors.generic');
  const docx = useMutation({
    mutationFn: async () => {
      const response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'docx' }),
      });
      if (!response.ok)
        throw new ApiClientError(response.status, 'export_failed', response.statusText);
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a');
      link.href = url;
      link.download = 'job-description.docx';
      link.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: ['timeline', agencyId, 'position', positionId],
      });
    },
    onError: (e) => setError(explain(e)),
  });
  const pdf = useMutation({
    mutationFn: () => apiFetch(base, { body: { format: 'pdf' } }),
    onSuccess: async () => {
      setError(null);
      setRequested(true);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setError(explain(e)),
  });

  return (
    <section aria-labelledby="export-heading" className="flex max-w-2xl flex-col gap-3">
      <h2 id="export-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={docx.isPending} onClick={() => docx.mutate()}>
          {t('docx')}
        </Button>
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
    </section>
  );
}
