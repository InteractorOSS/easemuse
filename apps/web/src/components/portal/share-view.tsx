// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import {
  FEEDBACK_CRITERIA,
  FEEDBACK_RATINGS,
  HM_DECISIONS,
  MAX_PROPOSED_SLOTS,
  REPORT_SECTIONS,
  type IntakeFormSnapshot,
  type JdForApprovalSnapshot,
  type ResumeForApprovalSnapshot,
  type SubmissionSnapshot,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { ShareDetail } from '@/server/portal/read';

/** One shared item: the JD, a submitted candidate, or the candidate's own resume, with what the person can do about it. */
export function ShareView({
  slug,
  prefix,
  shareId,
}: {
  slug: string;
  prefix: 'h' | 'c';
  shareId: string;
}) {
  const t = useTranslations('portal.share');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const base = `/api/portal/v1/${slug}`;
  const query = useQuery({
    queryKey: ['portal-share', slug, shareId],
    queryFn: ({ signal }) => apiFetch<ShareDetail>(`${base}/shares/${shareId}`, { signal }),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert">{t('error')}</p>
        <Link className="underline" href={`/${prefix}/${slug}`}>
          {t('back')}
        </Link>
      </div>
    );
  }
  const { snapshot, updatedOn } = query.data.data;
  return (
    <div className="flex flex-col gap-6">
      <Link className="text-sm underline" href={`/${prefix}/${slug}`}>
        {t('back')}
      </Link>
      {updatedOn ? (
        <p role="status" className="text-sm text-muted">
          {t('updatedOn', { date: format.dateTime(new Date(updatedOn), { dateStyle: 'medium' }) })}
        </p>
      ) : null}
      {snapshot.kind === 'jd_for_approval' ? (
        <JdShare base={base} shareId={shareId} snapshot={snapshot} />
      ) : null}
      {snapshot.kind === 'submission' ? (
        <SubmissionShare base={base} shareId={shareId} snapshot={snapshot} />
      ) : null}
      {snapshot.kind === 'tailored_resume' ? (
        <ResumeShare base={base} shareId={shareId} snapshot={snapshot} />
      ) : null}
      {snapshot.kind === 'intake_form' ? (
        <IntakeShare base={base} shareId={shareId} snapshot={snapshot} />
      ) : null}
    </div>
  );
}

/** Approve, or ask for changes with a comment. Used for the JD and for the resume. */
function Decision({ base, shareId }: { base: string; shareId: string }) {
  const t = useTranslations('portal.decision');
  const { toast } = useToast();
  const [comments, setComments] = useState('');
  const [done, setDone] = useState<'approved' | 'changes' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (kind: 'approve' | 'request-changes') =>
      apiFetch(`${base}/shares/${shareId}/${kind}`, {
        body: comments.trim() ? { comments: comments.trim() } : {},
      }).then(() => kind),
    onSuccess: (kind) => {
      setError(null);
      setDone(kind === 'approve' ? 'approved' : 'changes');
      toast({ title: kind === 'approve' ? t('approved') : t('changesSent') });
    },
    onError: (e) =>
      setError(e instanceof ApiClientError && e.code === 'stale_share' ? t('stale') : t('error')),
  });
  if (done) return <p role="status">{done === 'approved' ? t('approved') : t('changesSent')}</p>;
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="portal-comments" className="text-sm font-medium">
          {t('comments')}
        </label>
        <textarea
          id="portal-comments"
          rows={4}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className="rounded-md border border-border bg-background p-2"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={send.isPending} onClick={() => send.mutate('approve')}>
          {t('approve')}
        </Button>
        <Button
          variant="secondary"
          disabled={send.isPending}
          onClick={() => send.mutate('request-changes')}
        >
          {t('requestChanges')}
        </Button>
      </div>
    </div>
  );
}

function JdShare({
  base,
  shareId,
  snapshot,
}: {
  base: string;
  shareId: string;
  snapshot: JdForApprovalSnapshot;
}) {
  const t = useTranslations('portal.jd');
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{snapshot.positionTitle}</h1>
        <p className="text-muted">{snapshot.clientName}</p>
        <p className="mt-2 text-sm">{t('intro')}</p>
      </div>
      {snapshot.sections.map((s) => (
        <section key={s.key} aria-labelledby={`jd-${s.key}`} className="flex flex-col gap-1">
          <h2 id={`jd-${s.key}`} className="font-semibold">
            {t(`sections.${s.key}`)}
          </h2>
          <p className="whitespace-pre-wrap">{s.status === 'missing' ? t('missing') : s.summary}</p>
        </section>
      ))}
      {snapshot.requirements.length > 0 ? (
        <section aria-labelledby="jd-reqs" className="flex flex-col gap-2">
          <h2 id="jd-reqs" className="font-semibold">
            {t('requirements')}
          </h2>
          <ul className="flex flex-col gap-1">
            {snapshot.requirements.map((r, i) => (
              <li key={i}>
                <span className="mr-2 text-xs text-muted">{t(`categories.${r.category}`)}</span>
                {r.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Decision base={base} shareId={shareId} />
    </>
  );
}

function SubmissionShare({
  base,
  shareId,
  snapshot,
}: {
  base: string;
  shareId: string;
  snapshot: SubmissionSnapshot;
}) {
  const t = useTranslations('portal.submission');
  const format = useFormatter();
  const file = (id: string) => `${base}/files/${shareId}/${id}`;
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{snapshot.candidateName}</h1>
        <p className="text-muted">{[snapshot.positionTitle, snapshot.clientName].join(' · ')}</p>
        <p className="text-sm text-muted">
          {t('submittedOn', {
            date: format.dateTime(new Date(snapshot.submittedAt), { dateStyle: 'medium' }),
          })}
        </p>
      </div>
      <section aria-labelledby="sub-docs" className="flex flex-col gap-1">
        <h2 id="sub-docs" className="font-semibold">
          {t('documents')}
        </h2>
        <a className="underline" href={file(snapshot.reportFile.fileId)}>
          {t('report')}
        </a>
        <a className="underline" href={file(snapshot.resumeFile.fileId)}>
          {t('resume')}
        </a>
      </section>
      {[...REPORT_SECTIONS, 'recruiterAssessment' as const].map((key) => (
        <section key={key} aria-labelledby={`sub-${key}`} className="flex flex-col gap-1">
          <h2 id={`sub-${key}`} className="font-semibold">
            {t(`sections.${key}`)}
          </h2>
          <p className="whitespace-pre-wrap">{snapshot.report[key]}</p>
        </section>
      ))}
      <HmDecisionForm base={base} shareId={shareId} />
      <SlotsForm base={base} shareId={shareId} />
      <HmFeedbackForm base={base} shareId={shareId} />
    </>
  );
}

/** The intake questionnaire (FR-HMP-03): answers go to the recruiter as proposals and change nothing until accepted. */
function IntakeShare({
  base,
  shareId,
  snapshot,
}: {
  base: string;
  shareId: string;
  snapshot: IntakeFormSnapshot;
}) {
  const t = useTranslations('portal.intake');
  const topics = useTranslations('positions.intake.topics');
  const [values, setValues] = useState<Record<string, string>>({});
  const [stages, setStages] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'empty' | 'error'>('idle');
  const send = useMutation({
    mutationFn: () => {
      const answers: Record<string, { value: string; stages?: string[] }> = {};
      for (const { key } of snapshot.topics) {
        const value = (values[key] ?? '').trim();
        if (value) answers[key] = { value };
      }
      const list = stages
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      if (list.length > 0) {
        answers.interview_process = {
          value: answers.interview_process?.value ?? list.join(', '),
          stages: list,
        };
      }
      if (Object.keys(answers).length === 0) return Promise.reject(new Error('empty'));
      return apiFetch(`${base}/shares/${shareId}/intake-answers`, { body: { answers } });
    },
    onSuccess: () => setState('sent'),
    onError: (e) => setState(e instanceof Error && e.message === 'empty' ? 'empty' : 'error'),
  });
  if (state === 'sent') return <p role="status">{t('sent')}</p>;
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">
          {t('title', { position: snapshot.positionTitle })}
        </h1>
        <p className="text-muted">{snapshot.clientName}</p>
        <p className="mt-2 text-sm">{t('intro')}</p>
      </div>
      {snapshot.topics.map((topic) => (
        <div key={topic.key} className="flex max-w-xl flex-col gap-1">
          <label htmlFor={`in-${topic.key}`} className="font-medium">
            {topics(topic.key)}
          </label>
          {topic.questions.length > 0 ? (
            <div className="text-sm text-muted">
              <p>{t('questions')}</p>
              <ul className="list-disc pl-5">
                {topic.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <textarea
            id={`in-${topic.key}`}
            rows={3}
            value={values[topic.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [topic.key]: e.target.value }))}
            className="rounded-md border border-border bg-background p-2"
          />
          {topic.key === 'interview_process' ? (
            <>
              <label htmlFor="in-stages" className="text-sm text-muted">
                {t('stages')}
              </label>
              <textarea
                id="in-stages"
                rows={3}
                value={stages}
                onChange={(e) => setStages(e.target.value)}
                className="rounded-md border border-border bg-background p-2"
              />
            </>
          ) : null}
        </div>
      ))}
      {state === 'empty' || state === 'error' ? (
        <p role="alert" className="text-sm text-danger">
          {state === 'empty' ? t('empty') : t('error')}
        </p>
      ) : null}
      <div>
        <Button disabled={send.isPending} onClick={() => send.mutate()}>
          {t('send')}
        </Button>
      </div>
    </>
  );
}

/** Up to five interview times for the recruiter to choose from (FR-HMP-06). Nothing is booked by this. */
function SlotsForm({ base, shareId }: { base: string; shareId: string }) {
  const t = useTranslations('portal.slots');
  const [slots, setSlots] = useState<string[]>(['']);
  const [round, setRound] = useState('');
  const [format, setFormat] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'pending' | 'past' | 'cannot' | 'error'>(
    'idle',
  );
  const filled = slots.filter(Boolean);
  const send = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/shares/${shareId}/slots`, {
        body: {
          slots: filled.map((s) => new Date(s).toISOString()),
          ...(round.trim() ? { roundName: round.trim() } : {}),
          ...(format.trim() ? { format: format.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: () => setState('sent'),
    onError: (e) =>
      setState(
        e instanceof ApiClientError && e.status === 422
          ? 'past'
          : e instanceof ApiClientError && e.status === 409
            ? e.message.includes('waiting')
              ? 'pending'
              : 'cannot'
            : 'error',
      ),
  });
  if (state === 'sent') return <p role="status">{t('sent')}</p>;
  const message =
    state === 'pending'
      ? t('pending')
      : state === 'past'
        ? t('past')
        : state === 'cannot'
          ? t('cannot')
          : state === 'error'
            ? t('error')
            : null;
  return (
    <fieldset className="flex max-w-xl flex-col gap-2">
      <legend className="mb-1 text-lg font-semibold">{t('title')}</legend>
      <p className="text-sm text-muted">{t('hint')}</p>
      {message ? <p role="alert">{message}</p> : null}
      {slots.map((value, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label={t('slot', { n: i + 1 })}
              type="datetime-local"
              value={value}
              onChange={(e) => setSlots((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </div>
          {slots.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSlots((s) => s.filter((_, j) => j !== i))}
            >
              {t('remove', { n: i + 1 })}
            </Button>
          ) : null}
        </div>
      ))}
      {slots.length < MAX_PROPOSED_SLOTS ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setSlots((s) => [...s, ''])}>
            {t('add')}
          </Button>
        </div>
      ) : null}
      <TextField label={t('round')} value={round} onChange={(e) => setRound(e.target.value)} />
      <TextField label={t('format')} value={format} onChange={(e) => setFormat(e.target.value)} />
      <TextField label={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
      <div>
        <Button disabled={send.isPending || filled.length === 0} onClick={() => send.mutate()}>
          {t('send')}
        </Button>
      </div>
    </fieldset>
  );
}

function HmDecisionForm({ base, shareId }: { base: string; shareId: string }) {
  const t = useTranslations('portal.hmDecision');
  const { toast } = useToast();
  const [decision, setDecision] = useState<(typeof HM_DECISIONS)[number]>('interview');
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'pending'>('idle');
  const send = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/shares/${shareId}/decision`, {
        body: { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      }),
    onSuccess: () => {
      setState('sent');
      toast({ title: t('sent') });
    },
    onError: (e) => setState(e instanceof ApiClientError && e.status === 409 ? 'pending' : 'idle'),
  });
  if (state === 'sent') return <p role="status">{t('sent')}</p>;
  return (
    <fieldset className="flex max-w-xl flex-col gap-2">
      <legend className="mb-1 text-lg font-semibold">{t('title')}</legend>
      <p className="text-sm text-muted">{t('hint')}</p>
      {state === 'pending' ? <p role="alert">{t('pending')}</p> : null}
      <SelectField
        label={t('title')}
        value={decision}
        onChange={(e) => setDecision(e.target.value as 'interview')}
      >
        {HM_DECISIONS.map((d) => (
          <option key={d} value={d}>
            {t(d)}
          </option>
        ))}
      </SelectField>
      {decision !== 'interview' ? (
        <TextField label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      ) : null}
      <div>
        <Button
          disabled={send.isPending || (decision !== 'interview' && reason.trim().length < 3)}
          onClick={() => send.mutate()}
        >
          {t('send')}
        </Button>
      </div>
    </fieldset>
  );
}

function HmFeedbackForm({ base, shareId }: { base: string; shareId: string }) {
  const t = useTranslations('portal.feedback');
  const { toast } = useToast();
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [comments, setComments] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'noRound'>('idle');
  const send = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/shares/${shareId}/feedback`, {
        body: {
          ratings: Object.fromEntries(Object.entries(ratings).filter(([, v]) => v)),
          ...(comments.trim() ? { comments: comments.trim() } : {}),
        },
      }),
    onSuccess: () => {
      setState('sent');
      toast({ title: t('sent') });
    },
    onError: (e) => setState(e instanceof ApiClientError && e.status === 409 ? 'noRound' : 'idle'),
  });
  if (state === 'sent') return <p role="status">{t('sent')}</p>;
  return (
    <fieldset className="flex max-w-xl flex-col gap-2">
      <legend className="mb-1 text-lg font-semibold">{t('title')}</legend>
      <p className="text-sm text-muted">{t('hint')}</p>
      {state === 'noRound' ? <p role="alert">{t('noRound')}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {FEEDBACK_CRITERIA.map((k) => (
          <SelectField
            key={k}
            label={t(`criteria.${k}`)}
            value={ratings[k] ?? ''}
            onChange={(e) => setRatings((r) => ({ ...r, [k]: e.target.value }))}
          >
            <option value="">{t('ratings.none')}</option>
            {FEEDBACK_RATINGS.map((v) => (
              <option key={v} value={v}>
                {t(`ratings.${v}`)}
              </option>
            ))}
          </SelectField>
        ))}
      </div>
      <TextField
        label={t('comments')}
        value={comments}
        onChange={(e) => setComments(e.target.value)}
      />
      <div>
        <Button
          disabled={
            send.isPending || (Object.values(ratings).every((v) => !v) && comments.trim() === '')
          }
          onClick={() => send.mutate()}
        >
          {t('send')}
        </Button>
      </div>
    </fieldset>
  );
}

function ResumeShare({
  base,
  shareId,
  snapshot,
}: {
  base: string;
  shareId: string;
  snapshot: ResumeForApprovalSnapshot;
}) {
  const t = useTranslations('portal.resume');
  const r = snapshot.resume;
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">
          {t('title', { position: snapshot.positionTitle })}
        </h1>
        <p className="mt-2 text-sm">{t('intro', { client: snapshot.clientName })}</p>
      </div>
      {r.headline ? <p className="font-semibold">{r.headline}</p> : null}
      {r.summary ? (
        <section aria-labelledby="res-sum">
          <h2 id="res-sum" className="font-semibold">
            {t('summary')}
          </h2>
          <p>{r.summary}</p>
        </section>
      ) : null}
      {r.roles.length > 0 ? (
        <section aria-labelledby="res-exp" className="flex flex-col gap-3">
          <h2 id="res-exp" className="font-semibold">
            {t('experience')}
          </h2>
          {r.roles.map((role, i) => (
            <div key={i}>
              <p className="font-medium">{[role.title, role.company].join(', ')}</p>
              <p className="text-sm text-muted">
                {[role.start, role.current ? t('present') : role.end].filter(Boolean).join(' - ')}
              </p>
              <ul className="list-disc pl-5">
                {role.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
      {r.education.length > 0 ? (
        <section aria-labelledby="res-edu">
          <h2 id="res-edu" className="font-semibold">
            {t('education')}
          </h2>
          {r.education.map((e, i) => (
            <p key={i}>{[e.degree, e.school, e.year].filter(Boolean).join(', ')}</p>
          ))}
        </section>
      ) : null}
      {r.skills.length > 0 ? (
        <section aria-labelledby="res-skills">
          <h2 id="res-skills" className="font-semibold">
            {t('skills')}
          </h2>
          <p>{r.skills.join(', ')}</p>
        </section>
      ) : null}
      <Decision base={base} shareId={shareId} />
    </>
  );
}
