// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { EntityTimeline } from '@/components/activity/entity-timeline';
import { ArtifactEditor } from '@/components/artifacts/artifact-editor';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { CandidateView } from '@/server/candidates/service';
import { CandidateProfileEditor } from './candidate-profile-editor';

/** The candidate page (T-2-12, brief 4.2): profile, files, positions, do-not-contact and the timeline. */
export function CandidateDetail({
  agencyId,
  agencySlug,
  candidateId,
  viewerRole,
}: {
  agencyId: string;
  agencySlug: string;
  candidateId: string;
  viewerRole: 'admin' | 'lead' | 'recruiter';
}) {
  const t = useTranslations('candidates.detail');
  const states = useTranslations('common.states');
  const sources = useTranslations('candidates.sources');
  const format = useFormatter();
  const base = `/api/v1/agencies/${agencyId}`;
  const query = useQuery({
    queryKey: ['candidate', agencyId, candidateId],
    queryFn: ({ signal }) =>
      apiFetch<CandidateView>(`${base}/candidates/${candidateId}`, { signal }),
  });
  const c = query.data?.data;

  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError || !c) return <p role="alert">{states('error')}</p>;

  const stated = (value: string | null) => value ?? t('notStated');
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {c.fullName}
            {c.doNotContact ? (
              <span className="ml-3 rounded bg-danger/10 px-2 py-0.5 text-sm font-normal text-danger">
                {t('dnc.badge')}
              </span>
            ) : null}
          </h1>
          <p className="text-muted">{[c.currentTitle, c.location].filter(Boolean).join(' · ')}</p>
          <p className="text-sm text-muted">
            {t('source', { source: sources(c.source as 'linkedin') })}
            {c.yearsExperience !== null
              ? ` · ${t('experience', { count: c.yearsExperience })}`
              : ''}
          </p>
        </div>
        <Link className="underline" href={`/a/${agencySlug}/candidates`}>
          {t('back')}
        </Link>
      </div>

      {c.status === 'draft' ? (
        <p role="status">
          {t('draft')}{' '}
          <Link className="underline" href={`/a/${agencySlug}/candidates/${c.id}/review`}>
            {t('reviewLink')}
          </Link>
        </p>
      ) : null}

      <section aria-labelledby="contact-heading" className="flex flex-col gap-1 text-sm">
        <h2 id="contact-heading" className="text-lg font-semibold">
          {t('contact')}
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">{t('email')}</dt>
          <dd>{stated(c.email)}</dd>
          <dt className="text-muted">{t('phone')}</dt>
          <dd>{stated(c.phone)}</dd>
          <dt className="text-muted">{t('profileLink')}</dt>
          <dd>
            {c.profileUrl ? (
              <a
                className="underline"
                href={c.profileUrl}
                rel="noreferrer noopener"
                target="_blank"
              >
                {c.profileUrl}
              </a>
            ) : (
              t('notStated')
            )}
          </dd>
          {c.tags.length > 0 ? (
            <>
              <dt className="text-muted">{t('tags')}</dt>
              <dd>{c.tags.join(', ')}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {c.status === 'active' ? (
        <DoNotContact agencyId={agencyId} candidate={c} canClear={viewerRole === 'admin'} />
      ) : null}

      <section aria-labelledby="positions-heading" className="flex flex-col gap-2">
        <h2 id="positions-heading" className="text-lg font-semibold">
          {t('positions')}
        </h2>
        {c.positions.length === 0 ? <p className="text-sm text-muted">{t('noPositions')}</p> : null}
        <ul className="flex flex-col gap-1 text-sm">
          {c.positions.map((p) => (
            <li key={p.entryId}>
              <Link className="underline" href={`/a/${agencySlug}/positions/${p.positionId}`}>
                {p.title}
              </Link>{' '}
              <span className="text-muted">
                {p.clientName} · {t('stateLabel', { state: p.state })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="profile-heading" className="flex flex-col gap-3">
        <h2 id="profile-heading" className="text-lg font-semibold">
          {t('profile')}
        </h2>
        {c.profileArtifactId ? (
          <ArtifactEditor
            agencyId={agencyId}
            artifactId={c.profileArtifactId}
            ContentEditor={CandidateProfileEditor}
          />
        ) : (
          <p className="text-sm text-muted">{t('noProfile')}</p>
        )}
      </section>

      <section aria-labelledby="docs-heading" className="flex flex-col gap-2">
        <h2 id="docs-heading" className="text-lg font-semibold">
          {t('documents')}
        </h2>
        {c.documents.length === 0 ? <p className="text-sm text-muted">{t('noDocuments')}</p> : null}
        <ul className="flex flex-col gap-1 text-sm">
          {c.documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{doc.filename}</span>
              <span className="text-muted">
                {format.dateTime(new Date(doc.createdAt), { dateStyle: 'medium' })}
              </span>
              <a className="underline" href={`${base}/files/${doc.fileId}`}>
                {t('download')}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <EntityTimeline agencyId={agencyId} entityType="candidate" entityId={c.id} />
    </div>
  );
}

function DoNotContact({
  agencyId,
  candidate,
  canClear,
}: {
  agencyId: string;
  candidate: CandidateView;
  canClear: boolean;
}) {
  const t = useTranslations('candidates.detail.dnc');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setting = !candidate.doNotContact;
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/agencies/${agencyId}/candidates/${candidate.id}/do-not-contact`, {
        method: 'PATCH',
        body: { value: setting, reason: reason.trim() },
      }),
    onSuccess: async () => {
      setOpen(false);
      setReason('');
      setError(null);
      toast({ title: t('saved') });
      await queryClient.invalidateQueries({ queryKey: ['candidate', agencyId, candidate.id] });
      await queryClient.invalidateQueries({
        queryKey: ['timeline', agencyId, 'candidate', candidate.id],
      });
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && e.status === 403
          ? t('errors.forbidden')
          : e instanceof ApiClientError && e.status === 409
            ? t('errors.conflict')
            : t('errors.generic'),
      ),
  });
  return (
    <section aria-labelledby="dnc-heading" className="flex max-w-xl flex-col gap-2">
      <h2 id="dnc-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {candidate.doNotContact ? (
        <p className="text-sm">
          {t('since', {
            date: candidate.doNotContactAt
              ? format.dateTime(new Date(candidate.doNotContactAt), { dateStyle: 'medium' })
              : '',
            reason: candidate.doNotContactReason ?? '',
          })}
        </p>
      ) : null}
      {!setting && !canClear ? <p className="text-sm text-muted">{t('onlyAdmin')}</p> : null}
      {open ? (
        <form
          noValidate
          aria-label={setting ? t('mark') : t('clear')}
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="text-sm text-muted">{setting ? t('markHelp') : t('clearHelp')}</p>
          <TextField
            label={t('reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={reason.trim().length < 3 || save.isPending}>
              {setting ? t('mark') : t('clear')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : setting || canClear ? (
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {setting ? t('mark') : t('clear')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
