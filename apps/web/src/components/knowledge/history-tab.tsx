// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FEEDBACK_CRITERIA } from '@easemuse/core';
import { Badge } from '@/components/ui/badge';
import { TextField } from '@/components/ui/field';
import type { ClientHistory, HistoryCandidate } from '@/server/knowledge/history';
import { FewRecords } from './records';

/** The history itself (FR-KNW-01): totals, positions, the candidates put forward, the ratings and the reasons. */
export function HistoryTab({
  history,
  agencySlug,
}: {
  history: ClientHistory;
  agencySlug: string;
}) {
  const t = useTranslations('knowledge');
  const h = useTranslations('knowledge.history');
  const pos = useTranslations('positions');
  const format = useFormatter();
  const [q, setQ] = useState('');

  const outcome = (c: HistoryCandidate) => h(`outcomes.${c.outcome}`);
  const ratingsText = (c: HistoryCandidate) =>
    FEEDBACK_CRITERIA.flatMap((k) => {
      const counts = c.ratings[k];
      if (!counts) return [];
      const parts = (['strong', 'moderate', 'gap'] as const)
        .filter((r) => counts[r])
        .map((r) => `${h(r)} ${counts[r]}`);
      return [h('ratingPart', { criterion: t(`criteria.${k}`), counts: parts.join(', ') })];
    }).join('; ');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return history.candidates;
    return history.candidates.filter((c) =>
      [c.candidateName, c.positionTitle, outcome(c), c.reasonCode ?? '', c.seniority ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, history.candidates]);

  const totals = [
    ['positions', history.totals.positions],
    ['submitted', history.totals.submitted],
    ['interviewed', history.totals.interviewed],
    ['hired', history.totals.hired],
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="hist-totals">
        <h2 id="hist-totals" className="mb-2 text-lg font-semibold">
          {h('totalsTitle')}
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {totals.map(([key, value]) => (
            <div key={key} className="rounded-md border border-border p-3">
              <dt className="text-sm text-muted">{h(key)}</dt>
              <dd className="text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="hist-positions" className="flex flex-col gap-2">
        <h2 id="hist-positions" className="text-lg font-semibold">
          {h('positionsTitle')}
        </h2>
        <ul className="flex flex-col gap-2">
          {history.positions.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
              <span className="flex flex-wrap items-center gap-2">
                <Link className="font-medium underline" href={`/a/${agencySlug}/positions/${p.id}`}>
                  {p.title}
                </Link>
                {p.isCurrent ? <Badge>{h('thisPosition')}</Badge> : null}
              </span>
              <span className="text-sm text-muted">
                {h('positionLine', {
                  status: pos(`status.${p.status as 'draft'}`),
                  openings: p.openings,
                })}
                {' · '}
                {format.dateTime(new Date(p.createdAt), { dateStyle: 'medium' })}
              </span>
              <span className="text-sm">
                {h('positionCounts', {
                  submitted: p.submitted,
                  interviewed: p.interviewed,
                  hired: p.hired,
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hist-candidates" className="flex flex-col gap-3">
        <h2 id="hist-candidates" className="text-lg font-semibold">
          {h('candidatesTitle')}
        </h2>
        {history.candidates.length === 0 ? (
          <p className="text-muted">{h('noCandidates')}</p>
        ) : (
          <>
            <div className="max-w-md">
              <TextField
                label={h('searchLabel')}
                hint={h('searchHint')}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {shown.length === 0 ? <p className="text-muted">{h('noMatch')}</p> : null}
            <ul className="flex flex-col gap-2">
              {shown.map((c) => (
                <li
                  key={c.entryId}
                  className="flex flex-col gap-1 rounded-md border border-border p-3"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      className="font-medium underline"
                      href={`/a/${agencySlug}/positions/${c.positionId}/candidates/${c.entryId}`}
                    >
                      {c.candidateName}
                    </Link>
                    <Badge>{outcome(c)}</Badge>
                  </span>
                  <span className="text-sm text-muted">
                    {c.positionTitle}
                    {c.seniority ? ` · ${h('level', { level: c.seniority })}` : ''}
                    {c.submittedAt
                      ? ` · ${format.dateTime(new Date(c.submittedAt), { dateStyle: 'medium' })}`
                      : ''}
                  </span>
                  <span className="text-sm">
                    {c.rounds.length === 0
                      ? h('noRounds')
                      : h('rounds', { count: c.rounds.length })}
                  </span>
                  {ratingsText(c) ? (
                    <span className="text-sm">{h('ratings', { text: ratingsText(c) })}</span>
                  ) : null}
                  {c.reasonCode ? (
                    <span className="text-sm">{h('reason', { reason: c.reasonCode })}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="hist-feedback" className="flex flex-col gap-2">
        <h2 id="hist-feedback" className="text-lg font-semibold">
          {h('feedbackTitle')}
        </h2>
        <p className="text-sm text-muted">{h('feedbackHint')}</p>
        {history.feedback.every((f) => f.total === 0) ? (
          <p className="text-muted">{h('feedbackEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">{h('feedbackTitle')}</caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {h('criterion')}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {h('strong')}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {h('moderate')}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {h('gap')}
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    {h('ratingsCount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.feedback.map((f) => (
                  <tr key={f.criterion} className="border-b border-border">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {t(`criteria.${f.criterion}`)}
                    </th>
                    <td className="py-2 pr-3">{f.strong}</td>
                    <td className="py-2 pr-3">{f.moderate}</td>
                    <td className="py-2 pr-3">{f.gap}</td>
                    <td className="py-2">
                      <span className="flex flex-wrap items-center gap-2">
                        {f.total}
                        <FewRecords small={f.small} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="hist-decline" className="flex flex-col gap-2">
        <h2 id="hist-decline" className="text-lg font-semibold">
          {h('declineTitle')}
        </h2>
        {history.declineReasons.length === 0 ? (
          <p className="text-muted">{h('declineEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {history.declineReasons.map((r) => (
              <li key={r.code} className="flex flex-wrap items-center gap-2">
                {h('reasonCount', { code: r.code, count: r.count })}
                <FewRecords small={r.small} />
              </li>
            ))}
          </ul>
        )}
        {history.withheldReasons > 0 ? (
          <p className="text-sm text-muted">{t('withheld', { count: history.withheldReasons })}</p>
        ) : null}
      </section>
    </div>
  );
}
