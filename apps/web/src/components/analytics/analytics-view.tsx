// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { Tooltip } from '@/components/ui/tooltip';
import { apiFetch } from '@/lib/api-client';
import type { Duration, Rate } from '@/server/analytics/compute';
import type { CsvTable } from '@/server/analytics/query';
import type { AnalyticsView as View } from '@/server/analytics/service';
import type { ClientView } from '@/server/clients/service';
import type { Member } from '@/server/tenancy/members';

const DURATION_KPIS = ['timeToFill', 'timeToInterview'] as const;
const RATE_KPIS = [
  'outreachResponse',
  'submissionToInterview',
  'interviewToOffer',
  'offerAcceptance',
  'interviewToHire',
  'sourceToHire',
] as const;
type KpiKey = (typeof DURATION_KPIS)[number] | (typeof RATE_KPIS)[number];
/** The CSV tables (the server's list; kept here because client code imports server code as types only). */
const CSV_TABLES = [
  'kpis',
  'conversion',
  'sources',
  'capacity',
] as const satisfies readonly CsvTable[];

interface Filters {
  from: string;
  to: string;
  clientId: string;
  ownerId: string;
}

const toParams = (f: Filters) =>
  new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '') as [string, string][]);

/** Analytics (brief §13, US-1101, US-1102): KPIs, conversion, results by source and capacity. */
export function AnalyticsView({
  agencyId,
  canFilterByRecruiter,
}: {
  agencyId: string;
  canFilterByRecruiter: boolean;
}) {
  const t = useTranslations('analytics');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const base = `/api/v1/agencies/${agencyId}`;
  const [draft, setDraft] = useState<Filters>({ from: '', to: '', clientId: '', ownerId: '' });
  const [applied, setApplied] = useState<Filters>(draft);

  const query = useQuery({
    queryKey: ['analytics', agencyId, applied],
    queryFn: ({ signal }) => apiFetch<View>(`${base}/analytics?${toParams(applied)}`, { signal }),
  });
  const clients = useQuery({
    queryKey: ['clients', agencyId, 'analytics'],
    queryFn: ({ signal }) => apiFetch<ClientView[]>(`${base}/clients?limit=100`, { signal }),
  });
  const members = useQuery({
    queryKey: ['members', agencyId, 'analytics'],
    queryFn: ({ signal }) => apiFetch<Member[]>(`${base}/members?limit=100`, { signal }),
    enabled: canFilterByRecruiter,
  });

  const percent = (r: Rate) =>
    r.value === null
      ? t('notEnough')
      : format.number(r.value, { style: 'percent', maximumFractionDigits: 1 });
  const days = (d: Duration) =>
    d.medianDays === null ? t('notEnough') : t('days', { days: d.medianDays });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setApplied(draft);
  };

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>

      <form
        aria-label={t('filters.label')}
        onSubmit={submit}
        className="flex flex-wrap items-end gap-3"
      >
        <TextField
          label={t('filters.from')}
          type="date"
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
        />
        <TextField
          label={t('filters.to')}
          type="date"
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
        />
        <SelectField
          label={t('filters.client')}
          value={draft.clientId}
          onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
        >
          <option value="">{t('filters.all')}</option>
          {(clients.data?.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        {canFilterByRecruiter ? (
          <SelectField
            label={t('filters.recruiter')}
            value={draft.ownerId}
            onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
          >
            <option value="">{t('filters.all')}</option>
            {(members.data?.data ?? [])
              .filter((m) => m.active)
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email}
                </option>
              ))}
          </SelectField>
        ) : null}
        <Button type="submit">{t('filters.apply')}</Button>
      </form>

      {query.isPending ? (
        <p role="status">{states('loading')}</p>
      ) : query.isError ? (
        <p role="alert">{states('error')}</p>
      ) : (
        <Report
          view={query.data.data}
          applied={applied}
          base={base}
          percent={percent}
          days={days}
        />
      )}
    </div>
  );
}

function Report({
  view,
  applied,
  base,
  percent,
  days,
}: {
  view: View;
  applied: Filters;
  base: string;
  percent: (r: Rate) => string;
  days: (d: Duration) => string;
}) {
  const t = useTranslations('analytics');
  const { kpis, sources, capacity } = view;
  const exportParams = (table: string) => {
    const p = toParams({ ...applied, from: view.range.from, to: view.range.to });
    p.set('table', table);
    return p.toString();
  };

  return (
    <>
      <p className="text-sm text-muted" role="status">
        {t('period', { from: view.range.from, to: view.range.to })}
      </p>

      <section aria-labelledby="kpi-heading" className="flex flex-col gap-3">
        <h2 id="kpi-heading" className="text-lg font-semibold">
          {t('kpis.heading')}
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DURATION_KPIS.map((k) => (
            <KpiCard
              key={k}
              kpi={k}
              value={days(kpis[k])}
              detail={t('basedOn', { count: kpis[k].count })}
            />
          ))}
          {RATE_KPIS.map((k) => (
            <KpiCard
              key={k}
              kpi={k}
              value={percent(kpis[k])}
              detail={t('ofTotal', {
                numerator: kpis[k].numerator,
                denominator: kpis[k].denominator,
              })}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="conversion-heading" className="flex flex-col gap-3">
        <h2 id="conversion-heading" className="text-lg font-semibold">
          {t('conversion.heading')}
        </h2>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('conversion.caption')}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 font-medium">
                {t('conversion.from')}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t('conversion.to')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t('conversion.rate')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t('conversion.count')}
              </th>
            </tr>
          </thead>
          <tbody>
            {kpis.conversion.map((c) => (
              <tr key={c.from} className="border-b border-border">
                <th scope="row" className="px-3 py-2 font-medium">
                  {t(`stages.${c.from}`)}
                </th>
                <td className="px-3 py-2">{t(`stages.${c.to}`)}</td>
                <td className="px-3 py-2 text-right">{percent(c.rate)}</td>
                <td className="px-3 py-2 text-right">
                  {t('ofTotal', { numerator: c.rate.numerator, denominator: c.rate.denominator })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="sources-heading" className="flex flex-col gap-3">
        <h2 id="sources-heading" className="text-lg font-semibold">
          {t('sources.heading')}
        </h2>
        {sources.length === 0 ? (
          <p className="text-sm text-muted">{t('sources.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t('sources.caption')}</caption>
              <thead>
                <tr className="border-b border-border">
                  {(
                    [
                      'source',
                      'added',
                      'contacted',
                      'submitted',
                      'interviewed',
                      'offered',
                      'hired',
                      'hireRate',
                    ] as const
                  ).map((col, i) => (
                    <th
                      key={col}
                      scope="col"
                      className={
                        i === 0 ? 'px-3 py-2 font-medium' : 'px-3 py-2 text-right font-medium'
                      }
                    >
                      {t(`sources.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source} className="border-b border-border">
                    <th scope="row" className="px-3 py-2 font-medium">
                      {t.has(`sources.names.${s.source}`)
                        ? t(`sources.names.${s.source}`)
                        : s.source}
                    </th>
                    {[s.added, s.contacted, s.submitted, s.interviewed, s.offered, s.hired].map(
                      (n, i) => (
                        <td key={i} className="px-3 py-2 text-right">
                          {n}
                        </td>
                      ),
                    )}
                    <td className="px-3 py-2 text-right">{percent(s.hireRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="capacity-heading" className="flex flex-col gap-3">
        <h2 id="capacity-heading" className="text-lg font-semibold">
          {t('capacity.heading')}
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-4">
            <dt className="text-sm text-muted">{t('capacity.perRecruiter')}</dt>
            <dd className="text-2xl font-semibold">
              {capacity.activePositionsPerRecruiter ?? t('notEnough')}
            </dd>
          </div>
          <div className="rounded-2xl border border-border p-4">
            <dt className="text-sm text-muted">{t('capacity.timePerPosition')}</dt>
            <dd className="text-2xl font-semibold">{days(capacity.timePerPosition)}</dd>
          </div>
        </dl>
        {capacity.recruiters.length === 0 ? (
          <p className="text-sm text-muted">{t('capacity.empty')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('capacity.caption')}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('capacity.recruiter')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('capacity.active')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('capacity.filled')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('capacity.days')}
                </th>
              </tr>
            </thead>
            <tbody>
              {capacity.recruiters.map((r) => (
                <tr key={r.userId} className="border-b border-border">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {r.name}
                  </th>
                  <td className="px-3 py-2 text-right">{r.activePositionsPerWeek}</td>
                  <td className="px-3 py-2 text-right">{r.filled}</td>
                  <td className="px-3 py-2 text-right">{days(r.timePerPosition)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="export-heading" className="flex flex-col gap-2">
        <h2 id="export-heading" className="text-lg font-semibold">
          {t('export.heading')}
        </h2>
        <ul className="flex flex-wrap gap-4 text-sm">
          {CSV_TABLES.map((table) => (
            <li key={table}>
              <a className="underline" href={`${base}/analytics/export?${exportParams(table)}`}>
                {t(`export.${table}`)}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">{t('howCalculated')}</summary>
        <p className="mt-2 text-muted">{t('cohortNote')}</p>
        <dl className="mt-2 flex flex-col gap-2">
          {[...DURATION_KPIS, ...RATE_KPIS].map((k) => (
            <div key={k}>
              <dt className="font-medium">{t(`kpis.${k}.label`)}</dt>
              <dd className="text-muted">{t(`kpis.${k}.formula`)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}

function KpiCard({ kpi, value, detail }: { kpi: KpiKey; value: string; detail: string }) {
  const t = useTranslations('analytics');
  const label = t(`kpis.${kpi}.label`);
  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        <Tooltip content={t(`kpis.${kpi}.formula`)}>
          <button
            type="button"
            className="rounded-full px-1 text-xs text-muted hover:text-foreground"
            aria-label={t('formulaButton', { kpi: label })}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="8" cy="8" r="6.5" strokeWidth="1.3" />
              <path d="M8 7.2v4M8 4.8v.1" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </Tooltip>
      </div>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted">{detail}</span>
    </li>
  );
}
