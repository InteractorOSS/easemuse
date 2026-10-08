// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FEEDBACK_CRITERIA,
  PATTERN_DIMENSIONS,
  isSmallSample,
  type PatternQuestion,
  type ProfileReport,
} from '@easemuse/core';
import { SelectField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { PatternsView } from '@/server/knowledge/patterns';
import { Count, FewRecords, RateTable, RecordLinks } from './records';

/** The seven questions of brief 14 as descriptive reports (FR-KNW-02): every number with its record count and a few-records flag. */
export function PatternReports({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('knowledge.patterns');
  const states = useTranslations('common.states');
  const [scope, setScope] = useState<'client' | 'agency'>('client');
  const query = useQuery({
    queryKey: ['patterns', agencyId, positionId, scope],
    queryFn: ({ signal }) =>
      apiFetch<PatternsView>(
        `/api/v1/agencies/${agencyId}/positions/${positionId}/patterns?scope=${scope}`,
        { signal },
      ),
  });
  const view = query.data?.data;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm text-muted">{t('intro')}</p>
        <div className="max-w-xs">
          <SelectField
            label={t('scopeLabel')}
            value={scope}
            onChange={(e) => setScope(e.target.value as 'client' | 'agency')}
          >
            <option value="client">{t('client')}</option>
            <option value="agency">{t('agency')}</option>
          </SelectField>
        </div>
      </div>
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {view ? <Reports view={view} agencySlug={agencySlug} /> : null}
    </div>
  );
}

function Profile({
  report,
  agencySlug,
  base,
}: {
  report: ProfileReport;
  agencySlug: string;
  base: string;
}) {
  const t = useTranslations('knowledge.patterns');
  return (
    <div className="flex flex-col gap-5">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <span>{base}</span>
        <Count
          hits={report.base.hits}
          n={report.base.n}
          rate={report.base.rate}
          small={report.base.small}
        />
      </p>
      {PATTERN_DIMENSIONS.map((d) => (
        <RateTable
          key={d}
          caption={t(`dimensions.${d}`)}
          groupLabel={t('group')}
          rows={report[d]}
          agencySlug={agencySlug}
        />
      ))}
    </div>
  );
}

function Section({
  id,
  title,
  measure,
  children,
}: {
  id: string;
  title: string;
  measure: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`pat-${id}`} className="flex flex-col gap-3">
      <div>
        <h2 id={`pat-${id}`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="max-w-3xl text-sm text-muted">{measure}</p>
      </div>
      {children}
    </section>
  );
}

function Reports({ view, agencySlug }: { view: PatternsView; agencySlug: string }) {
  const t = useTranslations('knowledge.patterns');
  const k = useTranslations('knowledge');
  const r = view.reports;
  const q = (key: PatternQuestion) => ({
    title: t(`questions.${key}.title`),
    measure: t(`questions.${key}.measure`),
  });
  if (r.entries === 0) return <p className="text-muted">{t('empty')}</p>;
  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm">
        {t('total', { records: r.entries, positions: r.positions })}{' '}
        {r.withheld.values > 0 ? k('withheld', { count: r.withheld.values }) : null}
      </p>

      <Section id="q1" {...q('interviewProfiles')}>
        <Profile
          report={r.interviewProfiles}
          agencySlug={agencySlug}
          base={t('questions.interviewProfiles.title')}
        />
      </Section>

      <Section id="q2" {...q('hireProfiles')}>
        <Profile
          report={r.hireProfiles}
          agencySlug={agencySlug}
          base={t('questions.hireProfiles.title')}
        />
      </Section>

      <Section id="q3" {...q('sources')}>
        {r.sources.length === 0 ? null : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">{t('questions.sources.title')}</caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  {(
                    [
                      'source',
                      'added',
                      'contacted',
                      'submitted',
                      'interviewed',
                      'hired',
                      'quality',
                    ] as const
                  ).map((c) => (
                    <th key={c} scope="col" className="py-1 pr-3 font-medium">
                      {t(`sources.${c}`)}
                    </th>
                  ))}
                  <th scope="col" className="py-1 font-medium">
                    {t('records')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.sources.map((s) => (
                  <tr key={s.source} className="border-b border-border align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {s.source}
                    </th>
                    <td className="py-2 pr-3">{s.added}</td>
                    <td className="py-2 pr-3">{s.contacted}</td>
                    <td className="py-2 pr-3">{s.submitted}</td>
                    <td className="py-2 pr-3">{s.interviewed}</td>
                    <td className="py-2 pr-3">{s.hired}</td>
                    <td className="py-2 pr-3">
                      <Count
                        hits={s.interviewed}
                        n={s.submitted}
                        rate={s.qualityRate}
                        small={s.small}
                      />
                    </td>
                    <td className="py-2">
                      <RecordLinks agencySlug={agencySlug} refs={s.refs} count={s.refCount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="q4" {...q('jdResponse')}>
        <RateTable
          caption={t('jd.byPosition')}
          groupLabel={t('group')}
          rows={r.jdResponse.byPosition}
          agencySlug={agencySlug}
        />
        <RateTable
          caption={t('jd.byArrangement')}
          groupLabel={t('group')}
          rows={r.jdResponse.byArrangement}
          agencySlug={agencySlug}
        />
        <RateTable
          caption={t('jd.byPay')}
          groupLabel={t('group')}
          rows={r.jdResponse.byPay}
          agencySlug={agencySlug}
        />
      </Section>

      <Section id="q5" {...q('dropOff')}>
        <p className="text-sm">{t('dropOff.total', { count: r.dropOff.left })}</p>
        {r.dropOff.rows.length === 0 ? null : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">{t('questions.dropOff.title')}</caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t('dropOff.stage')}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t('dropOff.count')}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t('dropOff.reasons')}
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    {t('records')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.dropOff.rows.map((d) => (
                  <tr key={d.stage} className="border-b border-border align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {d.stage}
                    </th>
                    <td className="py-2 pr-3">
                      <Count hits={d.count} n={r.dropOff.left} rate={d.share} small={d.small} />
                    </td>
                    <td className="py-2 pr-3">
                      {d.reasons.length === 0
                        ? t('dropOff.noReasons')
                        : d.reasons.map((x) => `${x.code} (${x.count})`).join(', ')}
                    </td>
                    <td className="py-2">
                      <RecordLinks agencySlug={agencySlug} refs={d.refs} count={d.refCount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="q6" {...q('hmPreferences')}>
        <Profile
          report={r.hmPreferences.decided}
          agencySlug={agencySlug}
          base={t('hm.decidedTitle')}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="mb-1 text-left font-medium">{t('hm.ratingsTitle')}</caption>
            <thead>
              <tr className="border-b border-border text-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  {k('history.criterion')}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {k('history.strong')}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {k('history.moderate')}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {k('history.gap')}
                </th>
                <th scope="col" className="py-1 font-medium">
                  {k('history.ratingsCount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {FEEDBACK_CRITERIA.map((c) => {
                const x = r.hmPreferences.ratings.find((y) => y.criterion === c)!;
                return (
                  <tr key={c} className="border-b border-border">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {k(`criteria.${c}`)}
                    </th>
                    <td className="py-2 pr-3">{x.strong}</td>
                    <td className="py-2 pr-3">{x.moderate}</td>
                    <td className="py-2 pr-3">{x.gap}</td>
                    <td className="py-2">
                      <span className="flex flex-wrap items-center gap-2">
                        {x.total}
                        <FewRecords small={x.small} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {r.hmPreferences.reasons.length > 0 ? (
          <div>
            <h3 className="font-medium">{t('hm.reasonsTitle')}</h3>
            <ul className="list-disc pl-5 text-sm">
              {r.hmPreferences.reasons.map((x) => (
                <li key={x.code}>{k('history.reasonCount', { code: x.code, count: x.count })}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section id="q7" {...q('hireCharacteristics')}>
        {r.hireCharacteristics.hires === 0 ? (
          <p className="text-muted">{t('hire.noHires')}</p>
        ) : (
          <>
            <p className="font-medium">
              {t('hire.hiresTitle', { count: r.hireCharacteristics.hires })}
            </p>
            {PATTERN_DIMENSIONS.map((d) => (
              <RateTable
                key={d}
                caption={t(`dimensions.${d}`)}
                groupLabel={t('group')}
                rows={r.hireCharacteristics[d].map((x) => ({
                  ...x,
                  hits: x.n,
                  n: r.hireCharacteristics.hires,
                  rate: Math.round((x.n / r.hireCharacteristics.hires) * 100),
                  small: isSmallSample(r.hireCharacteristics.hires),
                }))}
                agencySlug={agencySlug}
              />
            ))}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="mb-1 text-left font-medium">{t('hire.criteriaTitle')}</caption>
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t('hire.criterion')}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t('hire.hires')}
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      {t('hire.others')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.hireCharacteristics.criteria.map((c) => (
                    <tr key={c.criterion} className="border-b border-border">
                      <th scope="row" className="py-2 pr-3 font-normal">
                        {k(`weights.${c.criterion}`)}
                      </th>
                      <td className="py-2 pr-3">
                        <Count
                          hits={c.hires.hits}
                          n={c.hires.n}
                          rate={c.hires.rate}
                          small={c.hires.small}
                        />
                      </td>
                      <td className="py-2">
                        <Count
                          hits={c.others.hits}
                          n={c.others.n}
                          rate={c.others.rate}
                          small={c.others.small}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted">{t('hire.criteriaHint')}</p>
          </>
        )}
      </Section>
    </div>
  );
}
