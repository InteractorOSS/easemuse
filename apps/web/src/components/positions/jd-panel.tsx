// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { OriginalJdView } from '@/server/positions/jd';

const MIN_PASTE = 50;

/** The client's original JD (US-102): upload or paste, with the reading status of each upload. */
export function JdPanel({
  agencyId,
  positionId,
  canEdit,
}: {
  agencyId: string;
  positionId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('positions.jd');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const path = `/api/v1/agencies/${agencyId}/positions/${positionId}/jd`;
  const key = ['position-jd', agencyId, positionId];

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<OriginalJdView[]>(path, { signal }),
    // Keep checking while a file is still being read.
    refetchInterval: (q) =>
      q.state.data?.data.some((j) => j.extractionStatus === 'pending') ? 2000 : false,
  });
  const done = async () => {
    setError(null);
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({
      queryKey: ['timeline', agencyId, 'position', positionId],
    });
  };
  const explain = (e: unknown) => {
    if (e instanceof ApiClientError && e.code === 'unsupported_type')
      return t('errors.unsupported');
    if (e instanceof ApiClientError && e.code === 'file_too_large') return t('errors.tooLarge');
    if (e instanceof ApiClientError && e.fields.text) return t('errors.tooShort');
    return t('errors.generic');
  };
  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch(path, { method: 'POST', body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        throw new ApiClientError(
          response.status,
          body?.error?.code ?? 'unknown_error',
          body?.error?.message ?? '',
        );
      }
    },
    onSuccess: async () => {
      if (fileInput.current) fileInput.current.value = '';
      await done();
    },
    onError: (e) => setError(explain(e)),
  });
  const savePasted = useMutation({
    mutationFn: () => apiFetch(path, { body: { text } }),
    onSuccess: async () => {
      setText('');
      await done();
    },
    onError: (e) => setError(explain(e)),
  });

  const originals = query.data?.data ?? [];
  return (
    <section aria-labelledby="jd-heading" className="flex max-w-2xl flex-col gap-4">
      <h2 id="jd-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && originals.length === 0 ? <p className="text-muted">{t('none')}</p> : null}
      <ul className="flex flex-col gap-3">
        {originals.map((jd) => (
          <li key={jd.id} className="rounded-md border border-border p-3 text-sm">
            <p className="font-medium">{jd.filename ?? t('pasted')}</p>
            <p className="text-muted">
              {t('added', {
                date: format.dateTime(new Date(jd.createdAt), { dateStyle: 'medium' }),
              })}
            </p>
            {jd.extractionStatus === 'pending' ? <p role="status">{t('pending')}</p> : null}
            {jd.extractionStatus === 'failed' ? (
              <p role="alert" className="text-danger">
                {t('failed', { reason: jd.extractionError ?? '' })}
              </p>
            ) : null}
            {jd.parsedFromImage ? <p className="text-warning">{t('fromImage')}</p> : null}
            {jd.fileId ? (
              <a className="underline" href={`/api/v1/agencies/${agencyId}/files/${jd.fileId}`}>
                {t('download')}
              </a>
            ) : null}
            {jd.text ? (
              <details className="mt-2">
                <summary className="cursor-pointer">{t('viewText')}</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap">{jd.text}</pre>
              </details>
            ) : null}
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('upload')}</span>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={uploadFile.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile.mutate(file);
              }}
            />
            <span className="text-muted">{t('uploadHint')}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('pasteLabel')}</span>
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="rounded-md border border-border bg-background p-2"
            />
          </label>
          <div>
            <Button
              disabled={text.trim().length < MIN_PASTE || savePasted.isPending}
              onClick={() => savePasted.mutate()}
            >
              {t('addText')}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
