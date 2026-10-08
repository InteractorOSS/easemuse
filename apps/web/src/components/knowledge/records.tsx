// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { MIN_SAMPLE, type EntryRef, type RateRow } from '@easemuse/core';
import { Badge } from '@/components/ui/badge';

/** Where a record is opened: the candidate in that position. */
export const recordHref = (agencySlug: string, ref: EntryRef) =>
  `/a/${agencySlug}/positions/${ref.positionId}/candidates/${ref.entryId}`;

/** "Few records": shown on every number that rests on fewer records than the sample threshold (brief 14). */
export function FewRecords({ small }: { small: boolean }) {
  const t = useTranslations('knowledge');
  return small ? (
    <Badge variant="draft" title={t('fewHint', { min: MIN_SAMPLE })}>
      {t('few')}
    </Badge>
  ) : null;
}

/** The records a number comes from, as links that open each one. */
export function RecordLinks({
  agencySlug,
  refs,
  count,
}: {
  agencySlug: string;
  refs: EntryRef[];
  count: number;
}) {
  const t = useTranslations('knowledge');
  if (count === 0) return <span className="text-muted">{t('noRate')}</span>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline">{t('showRecords', { count })}</summary>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {refs.map((ref, i) => (
          <li key={ref.entryId}>
            <Link className="underline" href={recordHref(agencySlug, ref)}>
              {t('record', { n: i + 1 })}
            </Link>
          </li>
        ))}
      </ul>
      {count > refs.length ? (
        <p className="mt-1 text-muted">{t('moreRecords', { count: count - refs.length })}</p>
      ) : null}
    </details>
  );
}

/** "6 of 10 (60%)" with the few-records flag. */
export function Count({
  hits,
  n,
  rate,
  small,
}: {
  hits: number;
  n: number;
  rate: number | null;
  small: boolean;
}) {
  const t = useTranslations('knowledge');
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        {rate === null ? t('ofRecords', { hits, n }) : t('ofRecordsRate', { hits, n, rate })}
      </span>
      <FewRecords small={small} />
    </span>
  );
}

/** One table of groups with their counts and records. */
export function RateTable({
  caption,
  groupLabel,
  rows,
  agencySlug,
}: {
  caption: string;
  groupLabel: string;
  rows: RateRow[];
  agencySlug: string;
}) {
  const t = useTranslations('knowledge.patterns');
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="mb-1 text-left font-medium">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-muted">
            <th scope="col" className="py-1 pr-3 font-medium">
              {groupLabel}
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              {t('count')}
            </th>
            <th scope="col" className="py-1 font-medium">
              {t('records')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border align-top">
              <th scope="row" className="py-2 pr-3 font-normal">
                {r.label}
              </th>
              <td className="py-2 pr-3">
                <Count hits={r.hits} n={r.n} rate={r.rate} small={r.small} />
              </td>
              <td className="py-2">
                <RecordLinks agencySlug={agencySlug} refs={r.refs} count={r.refCount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
