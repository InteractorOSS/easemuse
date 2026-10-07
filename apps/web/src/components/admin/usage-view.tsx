// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectField, TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import { USAGE_GROUPS, type UsageGroup, type UsageRow } from '@/server/platform/usage';

const dayStart = (d: string) => `${d}T00:00:00.000Z`;
const nextDay = (d: string) => new Date(Date.parse(dayStart(d)) + 86_400_000).toISOString();
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** /admin/usage: AI cost and tokens across agencies, grouped by agency, purpose, model or day. */
export function UsageView({ today = new Date() }: { today?: Date }) {
  const t = useTranslations('admin.usage');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const [from, setFrom] = useState(() =>
    isoDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
  );
  const [to, setTo] = useState(() => isoDay(today));
  const [groupBy, setGroupBy] = useState<UsageGroup>('agency');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  const query = useQuery({
    queryKey: ['admin', 'usage', from, to, groupBy],
    enabled: valid,
    queryFn: ({ signal }) =>
      apiFetch<UsageRow[]>(
        `/api/admin/v1/usage?${new URLSearchParams({ from: dayStart(from), to: nextDay(to), groupBy })}`,
        { signal },
      ),
  });
  const rows = query.data?.data ?? [];
  const total = rows.reduce(
    (sum, r) => ({
      calls: sum.calls + r.calls,
      input: sum.input + r.inputTokens,
      output: sum.output + r.outputTokens,
      cached: sum.cached + r.cachedTokens,
      cost: sum.cost + r.costUsd,
    }),
    { calls: 0, input: 0, output: 0, cached: 0, cost: 0 },
  );
  const n = (value: number) => format.number(value);
  const usd = (value: number) =>
    format.number(value, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div className="flex flex-wrap items-end gap-4">
        <TextField
          label={t('from')}
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <TextField
          label={t('to')}
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <SelectField
          label={t('groupBy')}
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as UsageGroup)}
        >
          {USAGE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {t(`group.${group}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {query.isFetching ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && rows.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['key', 'calls', 'input', 'output', 'cached', 'cost'] as const).map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className={
                      column === 'key'
                        ? 'px-3 py-2 font-medium'
                        : 'px-3 py-2 text-right font-medium'
                    }
                  >
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {row.label ?? row.key}
                  </th>
                  <td className="px-3 py-2 text-right">{n(row.calls)}</td>
                  <td className="px-3 py-2 text-right">{n(row.inputTokens)}</td>
                  <td className="px-3 py-2 text-right">{n(row.outputTokens)}</td>
                  <td className="px-3 py-2 text-right">{n(row.cachedTokens)}</td>
                  <td className="px-3 py-2 text-right">{usd(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <th scope="row" className="px-3 py-2">
                  {t('total')}
                </th>
                <td className="px-3 py-2 text-right">{n(total.calls)}</td>
                <td className="px-3 py-2 text-right">{n(total.input)}</td>
                <td className="px-3 py-2 text-right">{n(total.output)}</td>
                <td className="px-3 py-2 text-right">{n(total.cached)}</td>
                <td className="px-3 py-2 text-right">{usd(total.cost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
