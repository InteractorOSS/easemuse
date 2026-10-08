// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { CANDIDATE_SOURCES, type CandidateSourceValue } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { CandidateView } from '@/server/candidates/service';

/** Most files in one go (FR-SRC-10: about 20), and how many are sent at once. */
export const BULK_MAX_FILES = 20;
const PARALLEL_UPLOADS = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = /\.(pdf|docx|txt)$/i;

type Upload =
  | { name: string; state: 'waiting' | 'uploading' }
  | { name: string; state: 'rejected'; reason: 'unsupported' | 'tooLarge' | 'generic' }
  | { name: string; state: 'sent'; candidateId: string };

async function sendOne(
  agencyId: string,
  file: File,
  source: CandidateSourceValue,
): Promise<Upload> {
  if (!TYPES.test(file.name)) return { name: file.name, state: 'rejected', reason: 'unsupported' };
  if (file.size > MAX_BYTES) return { name: file.name, state: 'rejected', reason: 'tooLarge' };
  const form = new FormData();
  form.set('file', file);
  form.set('source', source);
  try {
    const response = await fetch(`/api/v1/agencies/${agencyId}/candidates/intake`, {
      method: 'POST',
      body: form,
    });
    const body = (await response.json().catch(() => null)) as {
      data?: { candidateId: string };
      error?: { code?: string };
    } | null;
    if (response.ok && body?.data)
      return { name: file.name, state: 'sent', candidateId: body.data.candidateId };
    const code = body?.error?.code;
    return {
      name: file.name,
      state: 'rejected',
      reason:
        code === 'unsupported_type'
          ? 'unsupported'
          : code === 'file_too_large'
            ? 'tooLarge'
            : 'generic',
    };
  } catch {
    return { name: file.name, state: 'rejected', reason: 'generic' };
  }
}

/**
 * Bulk resume upload (T-2-14, FR-SRC-10): up to 20 files from one source, each becoming a draft
 * candidate that waits for the recruiter's review. Uploading is the recruiter's request for the AI
 * profile (FR-AI-01), exactly as with a single file; nothing becomes a candidate without confirmation.
 */
export function BulkUpload({ agencyId, agencySlug }: { agencyId: string; agencySlug: string }) {
  const t = useTranslations('candidates.bulk');
  const sources = useTranslations('candidates.sources');
  const [source, setSource] = useState<CandidateSourceValue>('linkedin');
  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<Upload[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const running = useRef(false);

  const choose = (list: FileList | null) => {
    const all = [...(list ?? [])];
    setNotice(all.length > BULK_MAX_FILES ? t('tooMany', { max: BULK_MAX_FILES }) : null);
    setFiles(all.slice(0, BULK_MAX_FILES));
  };

  const start = async () => {
    if (running.current || files.length === 0) return;
    running.current = true;
    const queue = [...files];
    setUploads(queue.map((f) => ({ name: f.name, state: 'waiting' as const })));
    const patch = (index: number, next: Upload) =>
      setUploads((current) => current?.map((u, i) => (i === index ? next : u)) ?? null);
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const index = cursor++;
        const file = queue[index]!;
        patch(index, { name: file.name, state: 'uploading' });
        patch(index, await sendOne(agencyId, file, source));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, worker));
    running.current = false;
  };

  const finished =
    uploads !== null && uploads.every((u) => u.state === 'sent' || u.state === 'rejected');
  const sent = uploads?.filter((u) => u.state === 'sent').length ?? 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link className="underline" href={`/a/${agencySlug}/candidates`}>
          {t('back')}
        </Link>
      </div>
      <p className="text-sm text-muted">{t('intro', { max: BULK_MAX_FILES })}</p>

      {uploads === null ? (
        <form
          noValidate
          aria-label={t('title')}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <SelectField
            label={t('source')}
            value={source}
            onChange={(e) => setSource(e.target.value as CandidateSourceValue)}
          >
            {CANDIDATE_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sources(s)}
              </option>
            ))}
          </SelectField>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('files')}</span>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => choose(e.target.files)}
            />
          </label>
          {notice ? (
            <p role="status" className="text-sm text-muted">
              {notice}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={files.length === 0}>
              {t('start', { count: files.length })}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p role="status" className="text-sm">
            {finished
              ? t('done', { ok: sent, total: uploads.length })
              : t('uploading', {
                  done: uploads.filter((u) => u.state === 'sent' || u.state === 'rejected').length,
                  total: uploads.length,
                })}
          </p>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('file')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u, i) => (
                <UploadRow key={i} agencyId={agencyId} agencySlug={agencySlug} upload={u} />
              ))}
            </tbody>
          </table>
          {finished ? (
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setUploads(null);
                  setFiles([]);
                }}
              >
                {t('again')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function UploadRow({
  agencyId,
  agencySlug,
  upload,
}: {
  agencyId: string;
  agencySlug: string;
  upload: Upload;
}) {
  const t = useTranslations('candidates.bulk');
  return (
    <tr className="border-b border-border">
      <th scope="row" className="px-3 py-2 font-medium">
        {upload.name}
      </th>
      <td className="px-3 py-2">
        {upload.state === 'sent' ? (
          <DraftStatus agencyId={agencyId} agencySlug={agencySlug} upload={upload} />
        ) : upload.state === 'rejected' ? (
          <span className="text-danger">
            {t('states.rejected', { reason: t(`errors.${upload.reason}`) })}
          </span>
        ) : (
          t(`states.${upload.state}`)
        )}
      </td>
    </tr>
  );
}

/** Follows one draft until the AI profile is ready, with a link to review it. */
function DraftStatus({
  agencyId,
  agencySlug,
  upload,
}: {
  agencyId: string;
  agencySlug: string;
  upload: Extract<Upload, { state: 'sent' }>;
}) {
  const t = useTranslations('candidates.bulk');
  const query = useQuery({
    queryKey: ['candidate', agencyId, upload.candidateId],
    queryFn: ({ signal }) =>
      apiFetch<CandidateView>(`/api/v1/agencies/${agencyId}/candidates/${upload.candidateId}`, {
        signal,
      }),
    refetchInterval: (q) => {
      const c = q.state.data?.data;
      if (!c) return 3000;
      const waiting =
        c.status === 'draft' &&
        (c.documents.some((d) => d.extractionStatus === 'pending') ||
          (c.documents.some((d) => d.extractionStatus === 'ready') && !c.profileArtifactId));
      return waiting ? 3000 : false;
    },
  });
  const c = query.data?.data;
  const state = !c
    ? 'reading'
    : c.status === 'active'
      ? 'confirmed'
      : c.status === 'discarded'
        ? 'discarded'
        : c.documents.some((d) => d.extractionStatus === 'failed')
          ? 'readFailed'
          : c.documents.some((d) => d.extractionStatus === 'pending')
            ? 'reading'
            : c.profileArtifactId
              ? 'ready'
              : 'drafting';
  return (
    <span className="flex flex-wrap items-center gap-3">
      {t(`states.${state}`)}
      {state === 'ready' || state === 'readFailed' ? (
        <Link
          className="underline"
          aria-label={t('review', { name: upload.name })}
          href={`/a/${agencySlug}/candidates/${upload.candidateId}/review`}
        >
          {t('reviewLink')}
        </Link>
      ) : null}
    </span>
  );
}
