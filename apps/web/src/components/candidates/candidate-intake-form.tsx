// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CANDIDATE_SOURCES, type CandidateSourceValue } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiClientError } from '@/lib/api-client';

const MIN_TEXT = 50;

/** Add a candidate (US-202): a resume file or pasted profile, where it came from, and an optional link. */
export function CandidateIntakeForm({
  agencyId,
  positionId,
  onCreated,
}: {
  agencyId: string;
  /** Pasting from a position: the source is always LinkedIn and the candidate is added to it later. */
  positionId?: string;
  onCreated: (candidateId: string) => void;
}) {
  const t = useTranslations('candidates.new');
  const sources = useTranslations('candidates.sources');
  const [mode, setMode] = useState<'file' | 'text'>(positionId ? 'text' : 'file');
  const [source, setSource] = useState<CandidateSourceValue>('linkedin');
  const [profileUrl, setProfileUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const explain = (e: unknown) => {
    if (e instanceof ApiClientError && e.code === 'unsupported_type')
      return t('errors.unsupported');
    if (e instanceof ApiClientError && e.code === 'file_too_large') return t('errors.tooLarge');
    return t('errors.generic');
  };
  const submit = useMutation({
    mutationFn: async () => {
      const path = positionId
        ? `/api/v1/agencies/${agencyId}/positions/${positionId}/candidates/intake`
        : `/api/v1/agencies/${agencyId}/candidates/intake`;
      let response: Response;
      if (mode === 'file') {
        const form = new FormData();
        form.set('file', file!);
        form.set('source', source);
        if (profileUrl.trim()) form.set('profileUrl', profileUrl.trim());
        response = await fetch(path, { method: 'POST', body: form });
      } else {
        response = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source,
            profileText: text,
            ...(profileUrl.trim() ? { profileUrl: profileUrl.trim() } : {}),
          }),
        });
      }
      const body = (await response.json().catch(() => null)) as {
        data?: { candidateId: string };
        error?: { code?: string; message?: string };
      } | null;
      if (!response.ok || !body?.data) {
        throw new ApiClientError(
          response.status,
          body?.error?.code ?? 'unknown_error',
          body?.error?.message ?? response.statusText,
        );
      }
      return body.data.candidateId;
    },
    onSuccess: (candidateId) => onCreated(candidateId),
    onError: (e) => setError(explain(e)),
  });

  const ready = mode === 'file' ? file !== null : text.trim().length >= MIN_TEXT;
  return (
    <form
      noValidate
      aria-label={t('title')}
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return setError(mode === 'file' ? t('errors.noFile') : t('errors.tooShort'));
        setError(null);
        submit.mutate();
      }}
    >
      <h1 className="text-2xl font-semibold">{positionId ? t('pasteTitle') : t('title')}</h1>
      <p className="text-sm text-muted">{positionId ? t('pasteIntro') : t('intro')}</p>
      {positionId ? null : (
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
      )}
      <TextField
        label={t('profileUrl')}
        hint={positionId ? t('profileUrlNote') : undefined}
        type="url"
        value={profileUrl}
        onChange={(e) => setProfileUrl(e.target.value)}
      />
      <fieldset className="flex gap-4">
        {(['file', 'text'] as const).map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm">
            <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
            {m === 'file' ? t('modeFile') : t('modeText')}
          </label>
        ))}
      </fieldset>
      {mode === 'file' ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('file')}</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('text')}</span>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="rounded-md border border-border bg-background p-2"
          />
        </label>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={submit.isPending}>
          {positionId ? t('pasteSubmit') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
