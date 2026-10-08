// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type MatchWeightKey, type PipelineState } from '@easemuse/core';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { AnalysisDetail } from '@/server/matching/detail';
import type { AnalysisView } from '@/server/matching/overrides';
import type { PipelineEntryView } from '@/server/pipeline/service';
import { InterviewPanel } from './interview-panel';
import { PortalSharing } from './portal-sharing';
import { ProposalsPanel } from './proposals-panel';
import { OfferPanel } from './offer-panel';
import { SubmissionPanel } from './submission-panel';
import { ReportPanel } from './report-panel';
import { ResumePanel } from './resume-panel';
import { QualificationPanel } from './qualification-panel';
import { OutreachPanel } from './outreach-panel';
import { ScreeningPanel } from './screening-panel';
import { TransitionControl } from './transition-control';

type Evidence = AnalysisDetail['criteria'][number]['evidence'][number];

/** The analysis of one candidate in one position (US-302, US-303, FR-MAT-05): grounds, overrides, assessment, review. */
export function AnalysisView({
  agencyId,
  agencySlug,
  positionId,
  entryId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
  entryId: string;
}) {
  const t = useTranslations('pipeline.analysis');
  const portalT = useTranslations('pipeline.portalAdmin');
  const states = useTranslations('pipeline.states');
  const common = useTranslations('common.states');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;
  const entryKey = ['pipeline-entry', agencyId, entryId];
  const latestKey = ['analysis-latest', agencyId, entryId];

  const entry = useQuery({
    queryKey: entryKey,
    queryFn: ({ signal }) => apiFetch<PipelineEntryView>(`${base}/pipeline/${entryId}`, { signal }),
  });
  const latest = useQuery({
    queryKey: latestKey,
    queryFn: ({ signal }) =>
      apiFetch<AnalysisView | null>(`${base}/pipeline/${entryId}/analysis`, { signal }),
  });
  const analysisId = latest.data?.data?.id ?? null;
  const detailKey = ['analysis-detail', agencyId, analysisId];
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => apiFetch<AnalysisDetail>(`${base}/analyses/${analysisId}`, { signal }),
    enabled: analysisId !== null,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: latestKey });
    await queryClient.invalidateQueries({ queryKey: ['analysis-detail', agencyId] });
    await queryClient.invalidateQueries({ queryKey: entryKey });
    await queryClient.invalidateQueries({ queryKey: ['review', agencyId, positionId] });
  };
  const run = useAiRun(`${base}/pipeline/${entryId}/analysis`, { onDone: () => void refresh() });
  const review = useMutation({
    mutationFn: () => apiFetch(`${base}/analyses/${analysisId}/review`, { method: 'POST' }),
    onSuccess: async () => {
      toast({ title: t('reviewedDone') });
      await refresh();
    },
  });

  const e = entry.data?.data;
  const d = detail.data?.data;
  if (entry.isPending || latest.isPending) return <p role="status">{common('loading')}</p>;
  if (entry.isError || latest.isError || !e) return <p role="alert">{common('error')}</p>;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{e.candidateName}</h1>
          <p className="text-muted">
            {t('stageLine', { stage: states(e.state as PipelineState) })}
          </p>
          <Link className="text-sm underline" href={`/a/${agencySlug}/candidates/${e.candidateId}`}>
            {t('candidatePage')}
          </Link>
        </div>
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}/candidates`}>
          {t('back')}
        </Link>
      </div>

      <div className="max-w-md">
        <TransitionControl
          agencyId={agencyId}
          entryId={entryId}
          name={e.candidateName}
          state={e.state as PipelineState}
          onMoved={refresh}
        />
      </div>

      <ScreeningPanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />

      {['screened', 'contacting', 'no_response', 'not_interested'].includes(e.state) ? (
        <OutreachPanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />
      ) : null}

      {['contacting', 'interested', 'qualified'].includes(e.state) ? (
        <QualificationPanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />
      ) : null}

      {['qualified', 'resume_ready', 'candidate_approved'].includes(e.state) ? (
        <ResumePanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />
      ) : null}

      {['qualified', 'resume_ready', 'candidate_approved'].includes(e.state) ? (
        <ReportPanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />
      ) : null}

      {['candidate_approved', 'submitted'].includes(e.state) ? (
        <SubmissionPanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />
      ) : null}

      {['submitted', 'interviewing', 'on_hold', 'offer', 'accepted', 'started'].includes(
        e.state,
      ) ? (
        <InterviewPanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />
      ) : null}

      {['offer', 'accepted', 'started', 'declined', 'reneged'].includes(e.state) ? (
        <OfferPanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />
      ) : null}

      {['qualified', 'resume_ready', 'candidate_approved'].includes(e.state) ? (
        <PortalSharing
          agencyId={agencyId}
          target={{ candidateId: e.candidateId }}
          subject={{ kind: 'tailored_resume', subjectId: entryId }}
          heading={portalT('resumeTitle')}
          onChanged={refresh}
        />
      ) : null}

      {['candidate_approved', 'submitted', 'interviewing', 'on_hold', 'offer'].includes(e.state) ? (
        <PortalSharing
          agencyId={agencyId}
          target={{ entryId }}
          subject={{ kind: 'submission', subjectId: entryId }}
          heading={portalT('submissionTitle')}
          onChanged={refresh}
        />
      ) : null}

      <ProposalsPanel agencyId={agencyId} entryId={entryId} onChanged={refresh} />

      <section aria-labelledby="analyze-heading" className="flex max-w-2xl flex-col gap-2">
        <h2 id="analyze-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('hint')}</p>
        <div>
          <Button disabled={run.state.status === 'running'} onClick={() => void run.start()}>
            {d ? t('again') : t('analyze')}
          </Button>
        </div>
        <StreamingDraft state={run.state} onCancel={run.cancel} onRetry={() => void run.start()} />
        {!d && !latest.data?.data ? <p className="text-sm text-muted">{t('none')}</p> : null}
      </section>

      {detail.isPending && analysisId ? <p role="status">{common('loading')}</p> : null}
      {detail.isError ? <p role="alert">{common('error')}</p> : null}
      {d ? (
        <DetailBody
          agencyId={agencyId}
          detail={d}
          onChanged={refresh}
          onReview={() => review.mutate()}
          reviewing={review.isPending}
        />
      ) : null}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const t = useTranslations('pipeline.analysis');
  if (evidence.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted">
      {evidence.map((e, i) =>
        e.type === 'quote' ? (
          <li key={i}>
            <q>{e.excerpt}</q>
          </li>
        ) : (
          <li key={i}>
            {e.rationale ? t('inferred', { rationale: e.rationale }) : t('inferredNoReason')}
          </li>
        ),
      )}
    </ul>
  );
}

function DetailBody({
  agencyId,
  detail,
  onChanged,
  onReview,
  reviewing,
}: {
  agencyId: string;
  detail: AnalysisDetail;
  onChanged: () => void | Promise<void>;
  onReview: () => void;
  reviewing: boolean;
}) {
  const t = useTranslations('pipeline.analysis');
  const levels = useTranslations('pipeline.levels');
  const criteria = useTranslations('pipeline.criteria');
  const a = detail.analysis;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="overall-heading" className="flex max-w-2xl flex-col gap-2">
        <h2 id="overall-heading" className="text-lg font-semibold">
          {t('overall')}
        </h2>
        {detail.explainOnly ? (
          <p className="text-sm">{t('explainOnly')}</p>
        ) : (
          <p className="text-3xl font-semibold">{a.overall}</p>
        )}
        {a.overridden ? (
          <p className="text-sm">
            {t('edited')}
            {a.overrideReason ? ` — ${t('editedReason', { reason: a.overrideReason })}` : ''}
            {!detail.explainOnly && a.computedOverall !== null
              ? ` (${t('computed', { score: a.computedOverall })})`
              : ''}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={detail.reviewed ? 'font-medium' : 'text-muted'}>
            {detail.reviewed ? t('reviewedBadge') : t('draftBadge')}
          </span>
          {a.stale ? <span className="text-warning">{t('stale')}</span> : null}
        </div>
        {detail.reviewed ? null : (
          <div className="flex flex-col gap-1">
            <div>
              <Button variant="secondary" disabled={reviewing} onClick={onReview}>
                {t('markReviewed')}
              </Button>
            </div>
            <p className="text-xs text-muted">{t('reviewedHelp')}</p>
          </div>
        )}
        {detail.explainOnly ? null : (
          <OverrideForm
            agencyId={agencyId}
            analysisId={a.id}
            target={{ kind: 'overall' }}
            label={t('override.overall')}
            current={a.overridden ? a.overall : null}
            computed={a.computedOverall}
            onChanged={onChanged}
          />
        )}
        <p className="text-xs text-muted">{t('basis')}</p>
      </section>

      <section aria-labelledby="criteria-heading" className="flex flex-col gap-4">
        <h2 id="criteria-heading" className="text-lg font-semibold">
          {t('criteriaTitle')}
        </h2>
        <ul className="flex flex-col gap-4">
          {detail.criteria.map((c) => (
            <li
              key={c.key}
              className="flex max-w-2xl flex-col gap-1 rounded-md border border-border p-3"
            >
              <p className="font-medium">
                {t('criterionLine', {
                  name: criteria(c.key as MatchWeightKey),
                  level: levels(c.level),
                })}
                {c.score !== null ? ` · ${t('score', { score: c.score })}` : ''}
                {c.overridden ? (
                  <span className="ml-2 text-sm font-normal">{t('edited')}</span>
                ) : null}
                {c.overridden && c.computedScore !== null ? (
                  <span className="ml-2 text-sm font-normal text-muted">
                    {t('computedScore', { score: c.computedScore })}
                  </span>
                ) : null}
              </p>
              <p className="text-sm">{c.summary}</p>
              <EvidenceList evidence={c.evidence} />
              {c.toConfirm.length > 0 ? (
                <div className="text-sm">
                  <span className="font-medium">{t('toConfirm')}</span>
                  <ul className="list-disc pl-5">
                    {c.toConfirm.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {c.overrideReason ? (
                <p className="text-xs text-muted">
                  {t('editedReason', { reason: c.overrideReason })}
                </p>
              ) : null}
              {detail.explainOnly ? null : (
                <OverrideForm
                  agencyId={agencyId}
                  analysisId={a.id}
                  target={{ kind: 'criterion', key: c.key as MatchWeightKey }}
                  label={t('override.criterion', { name: criteria(c.key as MatchWeightKey) })}
                  current={c.overridden ? c.score : null}
                  computed={c.computedScore}
                  onChanged={onChanged}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="req-heading" className="flex max-w-2xl flex-col gap-2">
        <h2 id="req-heading" className="text-lg font-semibold">
          {t('requirementsTitle')}
        </h2>
        {detail.requirements.length === 0 ? (
          <p className="text-sm text-muted">{t('noRequirements')}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {detail.requirements.map((r) => (
            <li key={r.criterionId} className="flex flex-col gap-0.5 text-sm">
              <span>
                <span className="text-muted">{t(`category.${r.category}`)}</span> {r.text}
                {': '}
                <strong
                  className={
                    r.category === 'disqualifying' && r.status === 'met' ? 'text-danger' : undefined
                  }
                >
                  {t(`requirementStatus.${r.category}.${r.status}`)}
                </strong>
              </span>
              <EvidenceList evidence={r.evidence} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t('requirementNote')}</p>
      </section>

      <section aria-labelledby="sg-heading" className="grid max-w-3xl gap-6 sm:grid-cols-3">
        <h2 id="sg-heading" className="sr-only">
          {t('strengths')}
        </h2>
        <ListBlock
          title={t('strengths')}
          items={detail.strengths.map((s) => `${criteria(s.key as MatchWeightKey)}: ${s.summary}`)}
          none={t('noneList')}
        />
        <ListBlock
          title={t('gaps')}
          items={detail.gaps.map((g) => `${criteria(g.key as MatchWeightKey)}: ${g.summary}`)}
          none={t('noneList')}
        />
        <ListBlock
          title={t('confirmList')}
          items={detail.toConfirm.map((x) => x.text)}
          none={t('noneList')}
        />
      </section>

      <AssessmentForm
        agencyId={agencyId}
        analysisId={a.id}
        initial={a.recruiterAssessment ?? ''}
        onChanged={onChanged}
      />
    </div>
  );
}

function ListBlock({ title, items, none }: { title: string; items: string[]; none: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{none}</p>
      ) : (
        <ul className="list-disc pl-5 text-sm">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Target = { kind: 'overall' } | { kind: 'criterion'; key: MatchWeightKey };

/** Change or remove the score for the overall or one criterion, always with a reason (FR-MAT-04). */
function OverrideForm({
  agencyId,
  analysisId,
  target,
  label,
  current,
  computed,
  onChanged,
}: {
  agencyId: string;
  analysisId: string;
  target: Target;
  label: string;
  current: number | null;
  computed: number | null;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.analysis.override');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(String(current ?? computed ?? ''));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: number | null) =>
      apiFetch(`/api/v1/agencies/${agencyId}/analyses/${analysisId}/overrides`, {
        method: 'PATCH',
        body: { ...target, score: value, reason: reason.trim() },
      }),
    onSuccess: async () => {
      setOpen(false);
      setReason('');
      setError(null);
      toast({ title: t('saved') });
      await onChanged();
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && e.status === 403
          ? t('errors.forbidden')
          : t('errors.generic'),
      ),
  });
  if (!open) {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t('open')}: ${label}`}
          onClick={() => setOpen(true)}
        >
          {t('open')}
        </Button>
      </div>
    );
  }
  const valid =
    score !== '' &&
    Number.isInteger(Number(score)) &&
    Number(score) >= 0 &&
    Number(score) <= 100 &&
    reason.trim().length >= 3;
  return (
    <form
      noValidate
      aria-label={label}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate(Number(score));
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label={t('score')}
          type="number"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
        <TextField label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid || save.isPending}>
          {t('save')}
        </Button>
        {current !== null ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={reason.trim().length < 3 || save.isPending}
            onClick={() => save.mutate(null)}
          >
            {t('remove')}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

function AssessmentForm({
  agencyId,
  analysisId,
  initial,
  onChanged,
}: {
  agencyId: string;
  analysisId: string;
  initial: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.analysis.assessment');
  const errors = useTranslations('pipeline.analysis.errors');
  const { toast } = useToast();
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/agencies/${agencyId}/analyses/${analysisId}/assessment`, {
        method: 'PUT',
        body: { text },
      }),
    onSuccess: async () => {
      setError(null);
      toast({ title: t('saved') });
      await onChanged();
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && e.status === 403 ? errors('forbidden') : errors('generic'),
      ),
  });
  return (
    <section aria-labelledby="assessment-heading" className="flex max-w-2xl flex-col gap-2">
      <h2 id="assessment-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('hint')}</p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('label')}</span>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded-md border border-border bg-background p-2"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button disabled={save.isPending || text === initial} onClick={() => save.mutate()}>
          {t('save')}
        </Button>
      </div>
    </section>
  );
}
