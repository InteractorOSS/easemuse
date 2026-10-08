// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { DuplicateResolution } from '@easemuse/core';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { DuplicateMatch } from '@/server/candidates/duplicates';
import type { CandidateView } from '@/server/candidates/service';
import { CandidateProfileEditor } from './candidate-profile-editor';

/** How long the page keeps checking for the AI profile before it offers a manual retry. */
const POLL_LIMIT = 90;

/** AI failure codes the page explains in plain words; anything else gets the generic text. */
const AI_ERROR_CODES = [
  'ai_account_no_credit',
  'ai_account_key',
  'ai_unavailable',
  'budget_exceeded',
  'ai_refused',
  'ai_failed',
] as const;

type Choice = 'none' | DuplicateResolution;

/** Review of a new candidate (US-202, US-203): read status, the AI profile draft, duplicates, and the decision. */
export function CandidateReview({
  agencyId,
  agencySlug,
  candidateId,
}: {
  agencyId: string;
  agencySlug: string;
  candidateId: string;
}) {
  const t = useTranslations('candidates.review');
  const d = useTranslations('candidates.review.duplicates');
  const decision = useTranslations('candidates.review.decision');
  const states = useTranslations('common.states');
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>('none');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['candidate', agencyId, candidateId],
    queryFn: ({ signal }) =>
      apiFetch<CandidateView>(`${base}/candidates/${candidateId}`, { signal }),
    // Keep checking while a file is being read or the AI draft is on its way.
    refetchInterval: (q) => {
      const c = q.state.data?.data;
      if (!c || c.status !== 'draft') return false;
      // The AI attempt failed: stop waiting and let the recruiter decide (retry or type it in).
      if (!c.profileArtifactId && c.profileAi?.status === 'failed') return false;
      const waiting =
        c.documents.some((x) => x.extractionStatus === 'pending') ||
        (c.documents.some((x) => x.extractionStatus === 'ready') && !c.profileArtifactId);
      return waiting && q.state.dataUpdateCount < POLL_LIMIT ? 2000 : false;
    },
  });
  const candidate = query.data?.data;
  const duplicates = useQuery({
    queryKey: ['candidate-duplicates', agencyId, candidateId, candidate?.profileArtifactId ?? null],
    queryFn: ({ signal }) =>
      apiFetch<DuplicateMatch[]>(`${base}/candidates/${candidateId}/duplicates`, { signal }),
    enabled: Boolean(candidate && candidate.status === 'draft'),
  });
  const matches = duplicates.data?.data ?? [];

  const structure = useMutation({
    mutationFn: () => apiFetch(`${base}/candidates/${candidateId}/structure`, { method: 'POST' }),
    onSuccess: async () => {
      toast({ title: t('structureQueued') });
      await queryClient.invalidateQueries({ queryKey: ['candidate', agencyId, candidateId] });
    },
    onError: () => setError(t('errors.generic')),
  });
  const manual = useMutation({
    mutationFn: () =>
      apiFetch<{ artifactId: string }>(`${base}/candidates/${candidateId}/manual-profile`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      setError(null);
      toast({ title: t('manualStarted') });
      await queryClient.invalidateQueries({ queryKey: ['candidate', agencyId, candidateId] });
    },
    onError: () => setError(t('errors.generic')),
  });
  const confirm = useMutation({
    mutationFn: () =>
      apiFetch<{ candidateId: string }>(`${base}/candidates`, {
        body: {
          draftId: candidateId,
          ...(choice !== 'none' ? { resolution: choice } : {}),
          ...(choice === 'merge' || choice === 'link' ? { targetId } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      }),
    onSuccess: async (res) => {
      toast({ title: t('confirmed') });
      // The candidate page shares this cache entry: drop the draft's copy so it shows the saved
      // candidate (a merge lands on the existing candidate, so refresh that one too).
      await queryClient.invalidateQueries({ queryKey: ['candidate', agencyId, candidateId] });
      await queryClient.invalidateQueries({
        queryKey: ['candidate', agencyId, res.data.candidateId],
      });
      router.push(`/a/${agencySlug}/candidates/${res.data.candidateId}`);
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === 'possible_duplicate')
        return setError(t('errors.duplicate'));
      if (e instanceof ApiClientError && e.fields.fullName) return setError(t('errors.needName'));
      if (e instanceof ApiClientError && e.fields.reason) return setError(t('errors.reason'));
      if (e instanceof ApiClientError && e.status === 409) return setError(t('errors.noProfile'));
      setError(t('errors.generic'));
    },
  });
  const discard = useMutation({
    mutationFn: () => apiFetch(`${base}/candidates/${candidateId}/discard`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: t('discarded') });
      router.push(`/a/${agencySlug}/candidates`);
    },
    onError: () => setError(t('errors.generic')),
  });

  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError || !candidate) return <p role="alert">{states('error')}</p>;
  if (candidate.status !== 'draft') {
    return (
      <p>
        <Link className="underline" href={`/a/${agencySlug}/candidates/${candidate.id}`}>
          {candidate.fullName}
        </Link>
      </p>
    );
  }

  const reading = candidate.documents.some((x) => x.extractionStatus === 'pending');
  const aiFailed = !candidate.profileArtifactId && candidate.profileAi?.status === 'failed';
  const aiErrorCode = AI_ERROR_CODES.find((c) => c === candidate.profileAi?.error) ?? 'generic';
  const manualButton = (
    <Button variant="secondary" disabled={manual.isPending} onClick={() => manual.mutate()}>
      {t('enterManually')}
    </Button>
  );
  const failed = candidate.documents.filter((x) => x.extractionStatus === 'failed');
  const target = matches.find((m) => m.candidateId === targetId);
  const needsTarget = choice === 'merge' || choice === 'link';
  const needsReason = choice === 'create' && matches.length > 0;
  const canConfirm =
    Boolean(candidate.profileArtifactId) &&
    (matches.length === 0 ? choice === 'none' : choice !== 'none') &&
    (!needsTarget || Boolean(targetId)) &&
    (!needsReason || reason.trim().length >= 3);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link className="underline" href={`/a/${agencySlug}/candidates`}>
          {t('back')}
        </Link>
      </div>

      <section aria-labelledby="docs-heading" className="flex flex-col gap-2">
        <h2 id="docs-heading" className="text-lg font-semibold">
          {t('documents')}
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {candidate.documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{doc.filename}</span>
              {doc.extractionStatus === 'pending' ? (
                <span role="status">{t('reading')}</span>
              ) : null}
              {doc.extractionStatus === 'failed' ? (
                <span role="alert" className="text-danger">
                  {t('readFailed', { reason: doc.extractionError ?? '' })} {t('readFailedHint')}
                </span>
              ) : null}
              {doc.parsedFromImage ? <span className="text-warning">{t('fromImage')}</span> : null}
              <a className="underline" href={`${base}/files/${doc.fileId}`}>
                {t('download')}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="profile-heading" className="flex flex-col gap-3">
        <h2 id="profile-heading" className="text-lg font-semibold">
          {t('profileTitle')}
        </h2>
        <p className="text-sm text-muted">{t('profileHint')}</p>
        {candidate.profileArtifactId ? (
          <ArtifactEditor
            agencyId={agencyId}
            artifactId={candidate.profileArtifactId}
            ContentEditor={CandidateProfileEditor}
          />
        ) : reading ? null : failed.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">{t('readFailedManual')}</p>
            <div>{manualButton}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {aiFailed ? (
              <p role="alert" className="text-danger">
                {t('aiFailed', { reason: t(`aiErrors.${aiErrorCode}`) })}
              </p>
            ) : (
              <p role="status">{t('waitingAi')}</p>
            )}
            <p className="text-sm text-muted">{t('manualHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={structure.isPending}
                onClick={() => structure.mutate()}
              >
                {t('structure')}
              </Button>
              {manualButton}
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="dup-heading" className="flex flex-col gap-3">
        <h2 id="dup-heading" className="text-lg font-semibold">
          {d('title')}
        </h2>
        {duplicates.isSuccess && matches.length === 0 ? (
          <p className="text-sm text-muted">{d('none')}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {matches.map((m) => (
            <li
              key={m.candidateId}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">{m.fullName}</span>
                <span className="text-muted">
                  {[m.currentTitle, m.email].filter(Boolean).join(' · ')}
                </span>
                <span>
                  {m.strength === 'exact'
                    ? d('exact', {
                        reasons: m.reasons
                          .filter((r) => r !== 'name_employer')
                          .map((r) => d(`reasons.${r}`))
                          .join(', '),
                      })
                    : d('possible')}
                </span>
              </div>
              <Button
                variant={targetId === m.candidateId ? 'primary' : 'secondary'}
                size="sm"
                aria-pressed={targetId === m.candidateId}
                onClick={() => setTargetId(m.candidateId)}
              >
                {d('choose', { name: m.fullName })}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="decision-heading" className="flex max-w-xl flex-col gap-3">
        <h2 id="decision-heading" className="text-lg font-semibold">
          {decision('title')}
        </h2>
        {matches.length === 0 ? (
          <p className="text-sm">{decision('none')}</p>
        ) : (
          <fieldset className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="resolution"
                checked={choice === 'merge'}
                disabled={!targetId}
                onChange={() => setChoice('merge')}
              />
              {decision('merge', { name: target?.fullName ?? '…' })}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="resolution"
                checked={choice === 'link'}
                disabled={!targetId}
                onChange={() => setChoice('link')}
              />
              {decision('link', { name: target?.fullName ?? '…' })}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="resolution"
                checked={choice === 'create'}
                onChange={() => setChoice('create')}
              />
              {decision('create')}
            </label>
          </fieldset>
        )}
        {needsReason || choice === 'link' || choice === 'merge' ? (
          <TextField
            label={decision('createReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canConfirm || confirm.isPending} onClick={() => confirm.mutate()}>
            {t('confirm')}
          </Button>
          <Button variant="secondary" disabled={discard.isPending} onClick={() => discard.mutate()}>
            {t('discard')}
          </Button>
        </div>
      </section>
    </div>
  );
}
