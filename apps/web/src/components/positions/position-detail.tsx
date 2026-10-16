// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import {
  POSITION_TRANSITIONS,
  REASON_REQUIRED,
  type GuardFailure,
  type GuardOverride,
  type MatchWeightKey,
  type PositionStatus,
} from '@easemuse/core';
import { EntityTimeline } from '@/components/activity/entity-timeline';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { PositionProgress } from '@/server/positions/progress';
import type { PositionView } from '@/server/positions/service';
import { JdPanel } from './jd-panel';
import { PositionForm } from './position-form';
import { PortalSharing } from '@/components/pipeline/portal-sharing';
import { IntakePanel } from './intake-panel';
import { nextAction, processSteps, type ProcessStep } from './position-progress';
import { WeightsEditor } from './weights-editor';

const STATUS_BADGE =
  'rounded-md border border-primary-strong px-2 py-0.5 text-sm text-primary-strong';
const NEXT_CARD =
  'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-strong bg-surface p-4';

/** A card of links on the position page: [label, href] pairs. */
interface LinkGroup {
  key: 'prepare' | 'candidates' | 'find' | 'insights';
  links: [string, string][];
}

/**
 * The position page (T-1-04, reorganized for G#10): the header with the key facts, where the search
 * stands in the hiring process and what to do next, links grouped by task, and the details,
 * JD and intake, weights, status and activity folded below.
 */
export function PositionDetail({
  agencyId,
  agencySlug,
  positionId,
  viewer,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
  /** Who is looking: only the owner, a lead or an admin sees the controls (the API enforces it regardless). */
  viewer: { userId: string; role: 'admin' | 'lead' | 'recruiter' };
}) {
  const t = useTranslations('positions');
  const d = useTranslations('positions.detail');
  const intake = useTranslations('positions.intake');
  const states = useTranslations('common.states');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const key = ['position', agencyId, positionId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<PositionView>(`/api/v1/agencies/${agencyId}/positions/${positionId}`, { signal }),
  });
  const position = query.data?.data;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({
      queryKey: ['timeline', agencyId, 'position', positionId],
    });
    await queryClient.invalidateQueries({ queryKey: ['positions', agencyId] });
  };

  const canEdit = viewer.role !== 'recruiter' || position?.ownerId === viewer.userId;

  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError || !position) return <p role="alert">{states('error')}</p>;

  const none = d('none');
  const compensation =
    position.compMin === null && position.compMax === null
      ? none
      : `${position.compMin ?? '…'} – ${position.compMax ?? '…'} ${position.compCurrency}`;
  const rows: [string, string][] = [
    [d('fields.location'), position.location],
    [d('fields.department'), position.department ?? none],
    [d('fields.reportingLine'), position.reportingLine ?? none],
    [
      d('fields.workArrangement'),
      position.workArrangement ? arrangementLabel(position.workArrangement, t) : none,
    ],
    [d('fields.compensation'), compensation],
    [d('fields.requiredExperience'), position.requiredExperience ?? none],
    [
      d('fields.requiredSkills'),
      position.requiredSkills.length ? position.requiredSkills.join(', ') : none,
    ],
    [d('fields.hiringTimeline'), position.hiringTimeline ?? none],
    [d('fields.openings'), String(position.openings)],
    [d('fields.workAuthorization'), position.workAuthorization ?? none],
  ];

  const base = `/a/${agencySlug}/positions/${positionId}`;
  const place = position.workArrangement
    ? `${position.location} · ${arrangementLabel(position.workArrangement, t)}`
    : position.location;
  const experience = position.requiredExperience
    ? d('experienceChip', { value: position.requiredExperience })
    : null;
  const chips = [
    place,
    compensation === none ? null : compensation,
    experience,
    d('openingsChip', { count: position.openings }),
  ].filter((c): c is string => Boolean(c));
  // Links grouped by what the recruiter is doing; editing pages only for those who may edit.
  const groups: LinkGroup[] = [
    {
      key: 'prepare',
      links: canEdit
        ? [
            [d('structureLink'), `${base}/structure`],
            [d('questionsLink'), `${base}/questions`],
            [d('profileLink'), `${base}/profile`],
          ]
        : [],
    },
    { key: 'candidates', links: [[d('boardLink'), `${base}/candidates`]] },
    {
      key: 'find',
      links: canEdit
        ? [
            [d('searchLink'), `${base}/search`],
            [d('poolLink'), `${base}/pool`],
          ]
        : [],
    },
    {
      key: 'insights',
      links: canEdit
        ? [
            [d('benchmarkLink'), `${base}/benchmark`],
            [d('historyLink'), `${base}/client-history`],
          ]
        : [[d('historyLink'), `${base}/client-history`]],
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{position.title}</h1>
            <span className={STATUS_BADGE}>{t(`status.${position.status}`)}</span>
          </div>
          <p className="text-sm text-muted">
            {d('clientOwnerLine', {
              client: position.clientName,
              name: position.ownerName ?? t('unknownOwner'),
            })}
          </p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {chips.map((chip) => (
              <li key={chip} className="rounded-md border border-border px-2 py-0.5">
                {chip}
              </li>
            ))}
          </ul>
        </div>
        {editing || !canEdit ? null : (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {d('edit')}
          </Button>
        )}
      </header>

      {editing ? (
        <PositionForm
          agencyId={agencyId}
          position={position}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await refresh();
          }}
        />
      ) : null}

      <ProcessOverview agencyId={agencyId} positionId={positionId} base={base} />

      <nav aria-label={d('groups.label')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {groups
          .filter((g) => g.links.length > 0)
          .map((g) => (
            <section
              key={g.key}
              aria-labelledby={`group-${g.key}`}
              className="flex flex-col gap-1 rounded-lg border border-border p-4"
            >
              <h2 id={`group-${g.key}`} className="font-semibold">
                {d(`groups.${g.key}`)}
              </h2>
              <p className="text-sm text-muted">{d(`groups.${g.key}Hint`)}</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {g.links.map(([label, href]) => (
                  <li key={href}>
                    <Link className="underline" href={href}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </nav>

      <div className="flex flex-col divide-y divide-border border-y border-border">
        <Fold title={d('sections.jd')} id="job-description">
          <JdPanel agencyId={agencyId} positionId={positionId} canEdit={canEdit} />
          <IntakePanel agencyId={agencyId} positionId={positionId} canEdit={canEdit} />
          {canEdit ? (
            <PortalSharing
              agencyId={agencyId}
              target={{ positionId }}
              subject={{ kind: 'intake_form', subjectId: positionId }}
              heading={intake('shareHeading')}
            />
          ) : null}
        </Fold>
        <Fold title={d('sections.details')}>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Fold>
        <Fold title={d('sections.weights')}>
          <WeightsEditor
            key={JSON.stringify(position.matchingWeights)}
            agencyId={agencyId}
            positionId={positionId}
            weights={position.matchingWeights as Record<MatchWeightKey, number>}
            canEdit={canEdit}
            onSaved={refresh}
          />
        </Fold>
        {canEdit ? (
          <Fold title={d('sections.status')}>
            <StatusControl agencyId={agencyId} position={position} onChanged={refresh} />
          </Fold>
        ) : null}
        <Fold title={d('sections.activity')}>
          <EntityTimeline agencyId={agencyId} entityType="position" entityId={positionId} />
        </Fold>
      </div>
    </div>
  );
}

/** A folded section of the position page: the summary stays visible, the content opens on demand. */
function Fold({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <details id={id} className="py-3">
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </details>
  );
}

/**
 * The hiring process at a glance (G#10): six steps from the brief's workflow, one suggested next
 * action and the candidate numbers. Read-only; every action is a link the recruiter chooses to follow.
 */
function ProcessOverview({
  agencyId,
  positionId,
  base,
}: {
  agencyId: string;
  positionId: string;
  base: string;
}) {
  const d = useTranslations('positions.detail');
  const p = useTranslations('positions.detail.process');
  const progress = useQuery({
    queryKey: ['position-progress', agencyId, positionId],
    queryFn: ({ signal }) =>
      apiFetch<PositionProgress>(`/api/v1/agencies/${agencyId}/positions/${positionId}/progress`, {
        signal,
      }),
  });
  const data = progress.data?.data;
  if (!data) return null;

  const next = nextAction(data);
  const detail = (step: ProcessStep): string => {
    if (step === 'jd') return p(`jdStates.${data.jd}`);
    if (step === 'profile') return p(`profileStates.${data.successProfile}`);
    const count = {
      sourcing: data.counts.pipeline,
      matching: data.counts.analyzed,
      outreach: data.counts.contacted,
      submission: data.counts.submitted,
    }[step];
    return p(`counts.${step}`, { count });
  };
  const numbers = [
    ['pipeline', data.counts.pipeline],
    ['analyzed', data.counts.analyzed],
    ['interested', data.counts.interested],
    ['submitted', data.counts.submitted],
  ] as const;

  return (
    <section aria-labelledby="process-heading" className="flex flex-col gap-4">
      <h2 id="process-heading" className="sr-only">
        {p('label')}
      </h2>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {processSteps(data).map(({ step, state }, i) => (
          <li
            key={step}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex flex-col border-t-4 pt-2 text-sm ${
              state === 'done'
                ? 'border-primary-strong'
                : state === 'current'
                  ? 'border-primary'
                  : 'border-border text-muted'
            }`}
          >
            <span className={state === 'current' ? 'font-semibold' : undefined}>
              {p('stepTitle', { n: i + 1, name: p(`steps.${step}`) })}
            </span>
            <span className={state === 'done' ? 'text-primary-strong' : 'text-muted'}>
              {p('stepDetail', { state: p(`states.${state}`), detail: detail(step) })}
            </span>
          </li>
        ))}
      </ol>

      <div className={NEXT_CARD}>
        <p>
          <span className="font-semibold">{d('next.label')}</span>{' '}
          {d(`next.${next.key}`, { count: next.count })}
        </p>
        <Link
          className="underline"
          href={next.page ? `${base}/${next.page}` : '#job-description'}
        >
          {d('next.open')}
        </Link>
      </div>

      <dl aria-label={d('numbers.label')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numbers.map(([key, value]) => (
          <div key={key} className="rounded-lg bg-surface p-3">
            <dt className="text-sm text-muted">{d(`numbers.${key}`)}</dt>
            <dd className="text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function arrangementLabel(value: string, t: ReturnType<typeof useTranslations>): string {
  return t.has(`form.arrangement.${value}`) ? t(`form.arrangement.${value}`) : value;
}

function StatusControl({
  agencyId,
  position,
  onChanged,
}: {
  agencyId: string;
  position: PositionView;
  onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations('positions');
  const d = useTranslations('positions.detail');
  const errors = useTranslations('positions.errors');
  const [target, setTarget] = useState<'' | PositionStatus>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guards, setGuards] = useState<GuardFailure[]>([]);
  const [overrideReason, setOverrideReason] = useState('');
  const options = POSITION_TRANSITIONS[position.status];
  const needsReason = target !== '' && REASON_REQUIRED.includes(target);
  const change = useMutation({
    mutationFn: (overrides: GuardOverride[] = []) =>
      apiFetch(`/api/v1/agencies/${agencyId}/positions/${position.id}/status`, {
        body: {
          status: target,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(overrides.length ? { overrideGuards: overrides } : {}),
        },
      }),
    onSuccess: async () => {
      setTarget('');
      setReason('');
      setError(null);
      setGuards([]);
      setOverrideReason('');
      await onChanged();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === 'guard_failed') {
        setError(null);
        setGuards(e.guards as GuardFailure[]);
        return;
      }
      setGuards([]);
      setError(
        e instanceof ApiClientError && e.status === 409
          ? errors('transition')
          : e instanceof ApiClientError && e.status === 403
            ? errors('forbidden')
            : e instanceof ApiClientError && e.status === 422
              ? d('reasonNeeded')
              : errors('generic'),
      );
    },
  });
  const canOverride = guards.length > 0 && guards.every((g) => g.mode === 'warn');
  return (
    <section aria-labelledby="status-heading" className="flex max-w-md flex-col gap-3">
      <h2 id="status-heading" className="text-lg font-semibold">
        {d('statusSection')}
      </h2>
      {options.length === 0 ? (
        <p className="text-muted">{d('finalStatus')}</p>
      ) : (
        <>
          <SelectField
            label={d('moveTo')}
            value={target}
            onChange={(e) => setTarget(e.target.value as '' | PositionStatus)}
          >
            <option value="" />
            {options.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </SelectField>
          {needsReason ? (
            <TextField
              label={d('reasonLabel')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          {guards.length > 0 ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-border p-3 text-sm"
            >
              <p className="font-medium">{d('guard.title')}</p>
              <ul className="list-disc pl-5">
                {guards.map((g) => (
                  <li key={g.guard}>{g.message}</li>
                ))}
              </ul>
              {canOverride ? (
                <>
                  <p>{d('guard.warnIntro')}</p>
                  <TextField
                    label={d('guard.overrideReason')}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                  <div>
                    <Button
                      variant="secondary"
                      disabled={overrideReason.trim().length < 3 || change.isPending}
                      onClick={() =>
                        change.mutate(
                          guards.map((g) => ({ guard: g.guard, reason: overrideReason.trim() })),
                        )
                      }
                    >
                      {d('guard.override')}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-muted">{d('guard.blocked')}</p>
              )}
            </div>
          ) : null}
          <div>
            <Button disabled={target === '' || change.isPending} onClick={() => change.mutate([])}>
              {d('moveButton')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
