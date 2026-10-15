// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { PIPELINE_STATES, type MatchWeightKey, type PipelineState } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { Dashboard, DashboardRow } from '@/server/matching/dashboard';
import { AddCandidatePanel } from './add-candidate-panel';
import { BatchProgress } from './batch-progress';
import { PositionIntake } from './position-intake';
import { TransitionControl } from './transition-control';

type SortMode = 'suggested' | 'name' | 'state';
const CRITERIA_SHOWN: MatchWeightKey[] = [
  'coreCompetencies',
  'relevantExperience',
  'industryFunctional',
  'locationArrangement',
  'compensationOther',
];
const MAX_BATCH = 50;

/** The candidate review dashboard of a position (US-304, brief 5.3) with adding, moving and analyzing candidates. */
export function ReviewBoard({
  agencyId,
  agencySlug,
  positionId,
  viewer,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
  /** Who is looking: the position's owner, leads and admins may reorder (the API enforces it). */
  viewer: { userId: string; role: 'admin' | 'lead' | 'recruiter' };
}) {
  const t = useTranslations('pipeline.board');
  const states = useTranslations('pipeline.states');
  const levels = useTranslations('pipeline.levels');
  const criteria = useTranslations('pipeline.criteria');
  const common = useTranslations('common.states');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<SortMode>('suggested');
  const [stateFilter, setStateFilter] = useState<'' | PipelineState>('');
  const [staleOnly, setStaleOnly] = useState(false);
  const [mustNotMet, setMustNotMet] = useState(false);
  const [jobRunId, setJobRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}`;
  const key = ['review', agencyId, positionId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<Dashboard>(`${base}/review`, { signal }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const position = useQuery({
    queryKey: ['position', agencyId, positionId],
    queryFn: ({ signal }) => apiFetch<{ ownerId: string }>(base, { signal }),
  });
  const canEditPosition =
    viewer.role !== 'recruiter' || position.data?.data.ownerId === viewer.userId;
  const dashboard = query.data?.data;
  const rows = useMemo(() => dashboard?.rows ?? [], [dashboard]);

  const visible = useMemo(() => {
    let list = rows.filter((r) => (stateFilter ? r.state === stateFilter : true));
    if (staleOnly) list = list.filter((r) => r.analysis?.stale);
    if (mustNotMet)
      list = list.filter((r) => (r.analysis?.summary?.requirements.mustHave.not_met ?? 0) > 0);
    if (sort === 'name')
      list = [...list].sort((a, b) => a.candidateName.localeCompare(b.candidateName));
    if (sort === 'state')
      list = [...list].sort(
        (a, b) => PIPELINE_STATES.indexOf(a.state) - PIPELINE_STATES.indexOf(b.state),
      );
    return list;
  }, [rows, stateFilter, staleOnly, mustNotMet, sort]);

  const saveOrder = useMutation({
    mutationFn: (entryIds: string[]) =>
      apiFetch(`${base}/review-order`, { method: 'PUT', body: { entryIds } }),
    onSuccess: async () => {
      toast({ title: t('orderSaved') });
      await refresh();
    },
    onError: () => setError(t('errors.generic')),
  });
  const resetOrder = useMutation({
    mutationFn: () => apiFetch(`${base}/review-order`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: () => setError(t('errors.generic')),
  });
  const analyze = useMutation({
    mutationFn: (entryIds: string[]) =>
      apiFetch<{ jobRunId: string; total: number }>(`${base}/analyses`, {
        body: { entryIds: entryIds.slice(0, MAX_BATCH) },
      }),
    onSuccess: (res) => {
      setError(null);
      setJobRunId(res.data.jobRunId);
    },
    onError: () => setError(t('errors.analyze')),
  });

  const move = (index: number, by: -1 | 1) => {
    const order = rows.map((r) => r.entryId);
    const target = index + by;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    saveOrder.mutate(order);
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const manual = rows.some((r) => r.manualRank !== null);
  // Analyses that a changed profile made out of date (T-3-12): one click starts them all again.
  const staleIds = rows.filter((r) => r.analysis?.stale).map((r) => r.entryId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}`}>
          {t('back')}
        </Link>
      </div>
      {dashboard?.explainOnly ? (
        <p className="rounded-md border border-border p-2 text-sm">{t('explainOnly')}</p>
      ) : null}

      {jobRunId ? (
        <BatchProgress
          agencyId={agencyId}
          jobRunId={jobRunId}
          names={Object.fromEntries(rows.map((r) => [r.entryId, r.candidateName]))}
          onFinished={refresh}
          onClose={() => setJobRunId(null)}
        />
      ) : null}

      <AddCandidatePanel
        agencyId={agencyId}
        agencySlug={agencySlug}
        positionId={positionId}
        inPosition={new Set(rows.map((r) => r.candidateId))}
        onAdded={refresh}
      />

      <PositionIntake agencyId={agencyId} agencySlug={agencySlug} positionId={positionId} />

      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label={t('sort.label')}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
        >
          {(['suggested', 'name', 'state'] as const).map((m) => (
            <option key={m} value={m}>
              {t(`sort.${m}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('filter.state')}
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as '' | PipelineState)}
        >
          <option value="">{t('filter.all')}</option>
          {PIPELINE_STATES.map((s) => (
            <option key={s} value={s}>
              {states(s)}
            </option>
          ))}
        </SelectField>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={staleOnly}
            onChange={(e) => setStaleOnly(e.target.checked)}
          />
          {t('filter.stale')}
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={mustNotMet}
            onChange={(e) => setMustNotMet(e.target.checked)}
          />
          {t('filter.mustNotMet')}
        </label>
        <Button
          disabled={selected.size === 0 || analyze.isPending || selected.size > MAX_BATCH}
          onClick={() => analyze.mutate([...selected])}
        >
          {t('analyzeSelected', { count: selected.size })}
        </Button>
        {canEditPosition && staleIds.length > 0 ? (
          <Button
            variant="secondary"
            disabled={analyze.isPending}
            onClick={() => analyze.mutate(staleIds)}
          >
            {t('reanalyzeStale', { count: Math.min(staleIds.length, MAX_BATCH) })}
          </Button>
        ) : null}
        {manual && canEditPosition ? (
          <Button variant="ghost" size="sm" onClick={() => resetOrder.mutate()}>
            {t('resetOrder')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {query.isPending ? <p role="status">{common('loading')}</p> : null}
      {query.isError ? <p role="alert">{common('error')}</p> : null}
      {query.isSuccess && rows.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}

      {visible.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label={t('selectAll')}
                    checked={visible.length > 0 && visible.every((r) => selected.has(r.entryId))}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? new Set(visible.map((r) => r.entryId)) : new Set(),
                      )
                    }
                  />
                </th>
                {canEditPosition &&
                sort === 'suggested' &&
                !stateFilter &&
                !staleOnly &&
                !mustNotMet ? (
                  <th scope="col" className="px-2 py-2 font-medium">
                    {t('columns.order')}
                  </th>
                ) : null}
                {(
                  [
                    'candidate',
                    'overall',
                    'core',
                    'experience',
                    'industry',
                    'location',
                    'compensation',
                    'musts',
                    'gaps',
                    'assessment',
                    'status',
                  ] as const
                ).map((c) => (
                  <th key={c} scope="col" className="px-2 py-2 font-medium">
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const index = rows.findIndex((r) => r.entryId === row.entryId);
                const reorderable =
                  canEditPosition &&
                  sort === 'suggested' &&
                  !stateFilter &&
                  !staleOnly &&
                  !mustNotMet;
                return (
                  <BoardRow
                    key={row.entryId}
                    row={row}
                    agencyId={agencyId}
                    agencySlug={agencySlug}
                    positionId={positionId}
                    selected={selected.has(row.entryId)}
                    onToggle={() => toggle(row.entryId)}
                    reorder={
                      reorderable
                        ? {
                            up: () => move(index, -1),
                            down: () => move(index, 1),
                            first: index === 0,
                            last: index === rows.length - 1,
                          }
                        : null
                    }
                    onMoved={refresh}
                    onReanalyze={
                      canEditPosition && !analyze.isPending
                        ? () => analyze.mutate([row.entryId])
                        : null
                    }
                    levels={(l) => levels(l)}
                    criterionLabel={(k) => criteria(k)}
                    stateLabel={(s) => states(s)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function BoardRow({
  row,
  agencyId,
  agencySlug,
  positionId,
  selected,
  onToggle,
  reorder,
  onMoved,
  onReanalyze,
  levels,
  stateLabel,
}: {
  row: DashboardRow;
  agencyId: string;
  agencySlug: string;
  positionId: string;
  selected: boolean;
  onToggle: () => void;
  reorder: { up: () => void; down: () => void; first: boolean; last: boolean } | null;
  onMoved: () => void | Promise<void>;
  onReanalyze: (() => void) | null;
  levels: (l: 'strong' | 'partial' | 'gap' | 'unknown') => string;
  criterionLabel: (k: MatchWeightKey) => string;
  stateLabel: (s: PipelineState) => string;
}) {
  const t = useTranslations('pipeline.board');
  const a = row.analysis;
  const cell = (key: MatchWeightKey) => {
    const c = a?.criteria[key];
    if (!c) return <span className="text-muted">{'–'}</span>;
    return (
      <span>
        {levels(c.level)}
        {c.score !== null ? ` ${c.score}` : ''}
        {c.overridden ? <span title={t('overridden')}>{' *'}</span> : null}
      </span>
    );
  };
  const musts = a?.summary?.requirements;
  const dq = musts?.disqualifying;
  return (
    <tr className="border-b border-border align-top">
      <td className="px-2 py-2">
        <input
          type="checkbox"
          aria-label={t('selectRow', { name: row.candidateName })}
          checked={selected}
          onChange={onToggle}
        />
      </td>
      {reorder ? (
        <td className="px-2 py-2">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('moveUp', { name: row.candidateName })}
              disabled={reorder.first}
              onClick={reorder.up}
            >
              {'↑'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('moveDown', { name: row.candidateName })}
              disabled={reorder.last}
              onClick={reorder.down}
            >
              {'↓'}
            </Button>
          </div>
        </td>
      ) : null}
      <th scope="row" className="px-2 py-2 font-medium">
        <Link
          href={`/a/${agencySlug}/positions/${positionId}/candidates/${row.entryId}`}
          className="underline"
        >
          {row.candidateName}
        </Link>
        {row.doNotContact ? (
          <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger">
            {t('doNotContact')}
          </span>
        ) : null}
      </th>
      <td className="px-2 py-2">
        {a ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">
              {a.overall !== null ? a.overall : '–'}
              {a.overridden ? <span title={t('overridden')}>{' *'}</span> : null}
            </span>
            {a.stale ? (
              <span className="flex flex-wrap items-center gap-1 text-xs text-warning">
                {t('stale')}
                {onReanalyze ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('reanalyzeOne', { name: row.candidateName })}
                    onClick={onReanalyze}
                  >
                    {t('reanalyze')}
                  </Button>
                ) : null}
              </span>
            ) : null}
            <span className="text-xs text-muted">{a.reviewed ? t('reviewed') : t('draft')}</span>
          </div>
        ) : (
          <span className="text-muted">{t('notAnalyzed')}</span>
        )}
      </td>
      <td className="px-2 py-2">{cell(CRITERIA_SHOWN[0]!)}</td>
      <td className="px-2 py-2">{cell(CRITERIA_SHOWN[1]!)}</td>
      <td className="px-2 py-2">{cell(CRITERIA_SHOWN[2]!)}</td>
      <td className="px-2 py-2">{cell(CRITERIA_SHOWN[3]!)}</td>
      <td className="px-2 py-2">{cell(CRITERIA_SHOWN[4]!)}</td>
      <td className="px-2 py-2">
        {musts ? (
          <div className="flex flex-col gap-0.5">
            <span>
              {t('musts', {
                met: musts.mustHave.met,
                notMet: musts.mustHave.not_met,
                unknown: musts.mustHave.unknown,
              })}
            </span>
            {dq && dq.met > 0 ? (
              <span className="font-medium text-danger">{t('dealBreaker')}</span>
            ) : dq && dq.unknown > 0 ? (
              <span className="text-warning">{t('dealBreakerUnknown')}</span>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="px-2 py-2">
        {a?.summary?.gaps
          .map((g) => g.summary)
          .slice(0, 2)
          .join(' · ')}
      </td>
      <td className="px-2 py-2">{a?.assessmentPreview}</td>
      <td className="px-2 py-2">
        <p className="mb-1 font-medium">{stateLabel(row.state)}</p>
        <TransitionControl
          agencyId={agencyId}
          entryId={row.entryId}
          name={row.candidateName}
          state={row.state}
          onMoved={onMoved}
        />
      </td>
    </tr>
  );
}
