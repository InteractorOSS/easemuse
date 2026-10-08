// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { SelectField, TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { AnalyticsResult } from '@/server/analytics/service';
import type { DurationStat, Ratio } from '@/server/analytics/kpis';

interface Filters {
  from: string;
  to: string;
  clientId: string;
  positionId: string;
  recruiterId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const defaultFilters = (): Filters => {
  const today = new Date();
  return {
    from: isoDay(new Date(today.getTime() - 89 * DAY_MS)),
    to: isoDay(today),
    clientId: '',
    positionId: '',
    recruiterId: '',
  };
};

const params = (f: Filters) => {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) if (value) p.set(key, value);
  return p;
};

type KpiKey =
  | 'timeToFill'
  | 'timeToInterview'
  | 'outreachResponseRate'
  | 'submissionToInterview'
  | 'interviewToOffer'
  | 'offerAcceptance'
  | 'interviewToHire'
  | 'sourceToHire';
const KPI_ORDER: KpiKey[] = [
  'timeToFill',
  'timeToInterview',
  'outreachResponseRate',
  'submissionToInterview',
  'interviewToOffer',
  'offerAcceptance',
  'interviewToHire',
  'sourceToHire',
];

/**
 * The analytics page (US-1101, brief §13): the KPIs with their formulas on hover, the stage funnel, the
 * source table and the capacity panel, for a date range and filters. Every table can be downloaded as
 * CSV with the same filters.
 */
export function AnalyticsView({
  agencyId,
  canPickRecruiter,
}: {
  agencyId: string;
  /** Leads and admins may look at one recruiter; a recruiter sees their own figures. */
  canPickRecruiter: boolean;
}) {
  const t = useTranslations('analytics');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const base = `/api/v1/agencies/${agencyId}`;

  const clients = useQuery({
    queryKey: ['analytics-clients', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<{ id: string; name: string }[]>(`${base}/clients?limit=100`, { signal }),
  });
  const positions = useQuery({
    queryKey: ['analytics-positions', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<{ id: string; title: string }[]>(`${base}/positions?limit=100`, { signal }),
  });
  const query = useQuery({
    queryKey: ['analytics', agencyId, filters],
    queryFn: ({ signal }) =>
      apiFetch<AnalyticsResult>(`${base}/analytics?${params(filters)}`, { signal }),
  });

  const set = (key: keyof Filters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));
  const percent = (r: Ratio) =>
    r.rate === null
      ? t('noData')
      : format.number(r.rate, { style: 'percent', maximumFractionDigits: 1 });
  const csvHref = (table: string) => `${base}/analytics/export?${params(filters)}&table=${table}`;

  const card = (key: KpiKey, result: AnalyticsResult) => {
    const kpi = result.kpis[key];
    const isDuration = key === 'timeToFill' || key === 'timeToInterview';
    const value = isDuration
      ? (kpi as DurationStat).medianDays === null
        ? t('noData')
        : t('days', { days: (kpi as DurationStat).medianDays! })
      : percent(kpi as Ratio);
    const detail = isDuration
      ? (kpi as DurationStat).count > 0
        ? t('basedOn', { count: (kpi as DurationStat).count })
        : null
      : (kpi as Ratio).denominator > 0
        ? t('ofCount', {
            numerator: (kpi as Ratio).numerator,
            denominator: (kpi as Ratio).denominator,
          })
        : null;
    return (
      <div key={key} className="flex flex-col gap-1 rounded-md border border-border p-4">
        <dt className="flex items-center gap-2 text-sm text-muted">
          {t(`kpis.${key}.name`)}
          <Tooltip content={t(`kpis.${key}.formula`)}>
            <button
              type="button"
              aria-label={t('formulaFor', { kpi: t(`kpis.${key}.name`) })}
              className="inline-flex size-5 items-center justify-center rounded-full border border-border text-xs"
            >
              {t('formulaMark')}
            </button>
          </Tooltip>
        </dt>
        <dd className="text-2xl font-semibold">{value}</dd>
        <dd className="text-xs text-muted">
          {detail}
          <span className="sr-only">{t(`kpis.${key}.formula`)}</span>
        </dd>
      </div>
    );
  };

  const csvLink = (table: 'kpis' | 'stages' | 'sources' | 'capacity') => (
    <a
      href={csvHref(table)}
      download
      className="text-sm text-primary underline"
      aria-label={t(`export.${table}`)}
    >
      {t('export.label')}
    </a>
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
        {!canPickRecruiter ? <p className="text-sm text-muted">{t('scopeOwn')}</p> : null}
      </header>

      <form
        aria-label={t('filters.label')}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => e.preventDefault()}
      >
        <TextField
          type="date"
          label={t('filters.from')}
          value={filters.from}
          onChange={set('from')}
        />
        <TextField type="date" label={t('filters.to')} value={filters.to} onChange={set('to')} />
        <SelectField
          label={t('filters.client')}
          value={filters.clientId}
          onChange={set('clientId')}
        >
          <option value="">{t('filters.all')}</option>
          {clients.data?.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('filters.position')}
          value={filters.positionId}
          onChange={set('positionId')}
        >
          <option value="">{t('filters.all')}</option>
          {positions.data?.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </SelectField>
        {canPickRecruiter ? (
          <SelectField
            label={t('filters.recruiter')}
            value={filters.recruiterId}
            onChange={set('recruiterId')}
          >
            <option value="">{t('filters.all')}</option>
            {query.data?.data.recruiters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectField>
        ) : null}
      </form>

      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.data ? (
        <AnalyticsBody
          result={query.data.data}
          t={t}
          percent={percent}
          card={card}
          csvLink={csvLink}
        />
      ) : null}
    </div>
  );
}

type T = ReturnType<typeof useTranslations<'analytics'>>;

function AnalyticsBody({
  result,
  t,
  percent,
  card,
  csvLink,
}: {
  result: AnalyticsResult;
  t: T;
  percent: (r: Ratio) => string;
  card: (key: KpiKey, result: AnalyticsResult) => React.ReactNode;
  csvLink: (table: 'kpis' | 'stages' | 'sources' | 'capacity') => React.ReactNode;
}) {
  const format = useFormatter();
  const th = 'px-3 py-2 font-medium';
  const num = 'px-3 py-2 text-right';
  return (
    <>
      <section aria-labelledby="kpi-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="kpi-title" className="text-lg font-semibold">
            {t('kpis.title')}
          </h2>
          {csvLink('kpis')}
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_ORDER.map((key) => card(key, result))}
        </dl>
      </section>

      <section aria-labelledby="stages-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="stages-title" className="text-lg font-semibold">
            {t('stages.title')}
          </h2>
          {csvLink('stages')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('stages.caption')}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={th}>
                  {t('stages.stage')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('stages.reached')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('stages.conversion')}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.stages.map((s) => (
                <tr key={s.stage} className="border-b border-border">
                  <th scope="row" className={th}>
                    {t(`stages.names.${s.stage}`)}
                  </th>
                  <td className={num}>{format.number(s.reached)}</td>
                  <td className={num}>{s.conversion ? percent(s.conversion) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="sources-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="sources-title" className="text-lg font-semibold">
            {t('sources.title')}
          </h2>
          {csvLink('sources')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('sources.caption')}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={th}>
                  {t('sources.source')}
                </th>
                {(
                  ['added', 'contacted', 'submitted', 'interviewed', 'offered', 'hired'] as const
                ).map((c) => (
                  <th key={c} scope="col" className={`${th} text-right`}>
                    {t(`sources.${c}`)}
                  </th>
                ))}
                <th scope="col" className={`${th} text-right`}>
                  {t('sources.sourceToHire')}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.sources.map((s) => (
                <tr key={s.source} className="border-b border-border">
                  <th scope="row" className={th}>
                    {t.has(`sources.names.${s.source}`) ? t(`sources.names.${s.source}`) : s.source}
                  </th>
                  <td className={num}>{format.number(s.added)}</td>
                  {(['contacted', 'submitted', 'interviewed', 'offered', 'hired'] as const).map(
                    (c) => (
                      <td key={c} className={num}>
                        {format.number(s[c])}
                        <span className="block text-xs text-muted">
                          {s.conversions[c].rate === null ? '' : percent(s.conversions[c])}
                        </span>
                      </td>
                    ),
                  )}
                  <td className={num}>{percent(s.sourceToHire)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="capacity-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="capacity-title" className="text-lg font-semibold">
            {t('capacity.title')}
          </h2>
          {csvLink('capacity')}
        </div>
        <p className="text-sm text-muted">{t('capacity.intro')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('capacity.caption')}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={th}>
                  {t('capacity.recruiter')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('capacity.positionsPerWeek')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('capacity.timePerPosition')}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.capacity.map((c) => (
                <tr key={c.recruiterId ?? 'all'} className="border-b border-border">
                  <th scope="row" className={th}>
                    {c.recruiterId === null ? t('capacity.everyone') : (c.name ?? c.recruiterId)}
                  </th>
                  <td className={num}>
                    {c.positionsPerWeek === null ? t('noData') : format.number(c.positionsPerWeek)}
                  </td>
                  <td className={num}>
                    {c.timePerPosition.medianDays === null
                      ? t('noData')
                      : t('days', { days: c.timePerPosition.medianDays })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">{t('capacity.formula')}</p>
      </section>
    </>
  );
}
