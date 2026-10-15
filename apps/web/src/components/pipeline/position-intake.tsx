// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  CANDIDATE_SOURCES,
  POSITION_INTAKE_MAX_FILES,
  type CandidateSourceValue,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { IntakeDraft } from '@/server/candidates/place';

const PARALLEL_UPLOADS = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = /\.(pdf|docx|txt)$/i;

type Rejection = 'unsupported' | 'tooLarge' | 'badUrl' | 'closed' | 'generic';
type Upload =
  | { name: string; state: 'waiting' | 'uploading' | 'sent' }
  | { name: string; state: 'rejected'; reason: Rejection };

interface Chosen {
  file: File;
  profileUrl: string;
}

async function sendOne(
  agencyId: string,
  positionId: string,
  source: CandidateSourceValue,
  { file, profileUrl }: Chosen,
): Promise<Upload> {
  const reject = (reason: Rejection): Upload => ({ name: file.name, state: 'rejected', reason });
  if (!TYPES.test(file.name)) return reject('unsupported');
  if (file.size > MAX_BYTES) return reject('tooLarge');
  const form = new FormData();
  form.set('file', file);
  form.set('source', source);
  form.set('positionId', positionId);
  if (profileUrl.trim()) form.set('profileUrl', profileUrl.trim());
  try {
    const response = await fetch(`/api/v1/agencies/${agencyId}/candidates/intake`, {
      method: 'POST',
      body: form,
    });
    if (response.ok) return { name: file.name, state: 'sent' };
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; fields?: Record<string, string> };
    } | null;
    const code = body?.error?.code;
    if (code === 'unsupported_type') return reject('unsupported');
    if (code === 'file_too_large') return reject('tooLarge');
    if (body?.error?.fields?.profileUrl) return reject('badUrl');
    if (response.status === 409) return reject('closed');
    return reject('generic');
  } catch {
    return reject('generic');
  }
}

/**
 * Resumes or LinkedIn profile PDFs uploaded straight into a position (G#9; brief 4.1, 4.2, 5).
 * Each file becomes a draft candidate as in the bulk upload; the recruiter reviews and confirms each
 * one, and that confirmation can add the candidate here and ask for the match analysis. The files
 * are what the recruiter saved themselves: nothing is fetched from LinkedIn (brief 4.1, C4).
 */
export function PositionIntake({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('pipeline.intake');
  const sources = useTranslations('candidates.sources');
  const queryClient = useQueryClient();
  const [source, setSource] = useState<CandidateSourceValue>('linkedin');
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [uploads, setUploads] = useState<Upload[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const key = ['intake-drafts', agencyId, positionId];
  const drafts = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<IntakeDraft[]>(
        `/api/v1/agencies/${agencyId}/positions/${positionId}/intake-drafts`,
        { signal },
      ),
    // Keep checking while a file is being read or the AI profile draft is on its way.
    refetchInterval: (q) =>
      q.state.data?.data.some((d) => d.state === 'reading' || d.state === 'drafting')
        ? 3000
        : false,
  });

  const choose = (list: FileList | null) => {
    const all = [...(list ?? [])];
    setNotice(
      all.length > POSITION_INTAKE_MAX_FILES
        ? t('tooMany', { max: POSITION_INTAKE_MAX_FILES })
        : null,
    );
    setChosen(all.slice(0, POSITION_INTAKE_MAX_FILES).map((file) => ({ file, profileUrl: '' })));
  };

  const start = async () => {
    if (running || chosen.length === 0) return;
    setRunning(true);
    const queue = [...chosen];
    setUploads(queue.map((c) => ({ name: c.file.name, state: 'waiting' as const })));
    const patch = (index: number, next: Upload) =>
      setUploads((current) => current?.map((u, i) => (i === index ? next : u)) ?? null);
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const index = cursor++;
        const item = queue[index]!;
        patch(index, { name: item.file.name, state: 'uploading' });
        patch(index, await sendOne(agencyId, positionId, source, item));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, worker));
    setRunning(false);
    setChosen([]);
    await queryClient.invalidateQueries({ queryKey: key });
  };

  const list = drafts.data?.data ?? [];

  return (
    <section aria-labelledby="intake-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="intake-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro', { max: POSITION_INTAKE_MAX_FILES })}</p>
      <p className="text-sm text-muted">{t('linkedinHint')}</p>

      <form
        noValidate
        aria-labelledby="intake-heading"
        className="flex flex-col gap-3"
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
            key={uploads ? 'after' : 'before'}
            type="file"
            multiple
            disabled={running}
            accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => choose(e.target.files)}
          />
        </label>
        {notice ? (
          <p role="status" className="text-sm text-muted">
            {notice}
          </p>
        ) : null}
        {chosen.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {chosen.map((c, i) => (
              <li key={`${c.file.name}-${i}`}>
                <TextField
                  label={t('profileUrl', { name: c.file.name })}
                  hint={i === 0 ? t('profileUrlHint') : undefined}
                  type="url"
                  value={c.profileUrl}
                  onChange={(e) =>
                    setChosen((all) =>
                      all.map((x, j) => (j === i ? { ...x, profileUrl: e.target.value } : x)),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <Button type="submit" disabled={running || chosen.length === 0}>
            {t('start', { count: chosen.length })}
          </Button>
        </div>
      </form>

      {uploads ? (
        <ul aria-label={t('uploadsLabel')} className="flex flex-col gap-1 text-sm">
          {uploads.map((u, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <span className="font-medium">{u.name}</span>
              {u.state === 'rejected' ? (
                <span className="text-danger">{t(`errors.${u.reason}`)}</span>
              ) : (
                <span>{t(`uploadStates.${u.state}`)}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="text-base font-semibold">{t('draftsTitle')}</h3>
      {drafts.isSuccess && list.length === 0 ? (
        <p className="text-sm text-muted">{t('draftsEmpty')}</p>
      ) : null}
      {list.length > 0 ? (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('draftsTitle')}</caption>
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
            {list.map((d) => (
              <tr key={d.candidateId} className="border-b border-border">
                <th scope="row" className="px-3 py-2 font-medium">
                  {d.filename}
                </th>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap items-center gap-3">
                    {t(`draftStates.${d.state}`)}
                    {d.state === 'reading' || d.state === 'drafting' ? null : (
                      <Link
                        className="underline"
                        aria-label={t('review', { name: d.filename })}
                        href={`/a/${agencySlug}/candidates/${d.candidateId}/review`}
                      >
                        {t('reviewLink')}
                      </Link>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
