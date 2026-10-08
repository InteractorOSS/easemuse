// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { BillingOverview } from '@/server/billing/service';

/** Plan, seats, this month's usage and invoices from Billing Server (US-1308), for an agency admin and for /admin. */
export function BillingSummary({ overview }: { overview: BillingOverview }) {
  const t = useTranslations('settings.billing');
  const format = useFormatter();
  const usd = (n: number) => format.number(n, { style: 'currency', currency: 'USD' });
  const day = (value: string | Date | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium' }) : '-';
  const { plan, seats, usage, invoices } = overview;

  return (
    <div className="flex flex-col gap-6">
      {overview.connected ? null : (
        <p role="status" className="rounded-md border border-border p-3 text-sm">
          {t('notConnected')}
        </p>
      )}

      <section aria-labelledby="plan-heading" className="flex flex-col gap-2">
        <h2 id="plan-heading" className="text-lg font-semibold">
          {t('plan.title')}
        </h2>
        {plan ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{plan.name ?? t('plan.unnamed')}</span>
            {plan.status ? <Badge>{plan.status}</Badge> : null}
            <span className="text-muted">{t('plan.synced', { when: day(plan.syncedAt) })}</span>
            {plan.error ? (
              <span role="alert" className="text-danger">
                {t('plan.stale')}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('plan.none')}</p>
        )}
      </section>

      <section aria-labelledby="seats-heading" className="flex flex-col gap-2">
        <h2 id="seats-heading" className="text-lg font-semibold">
          {t('seats.title')}
        </h2>
        <p className="text-sm">
          {seats.limit === null
            ? t('seats.noLimit', { active: seats.active })
            : t('seats.line', { active: seats.active, limit: seats.limit })}
          {seats.pending > 0 ? ` ${t('seats.pending', { count: seats.pending })}` : ''}
        </p>
        {seats.limit !== null && seats.active + seats.pending >= seats.limit ? (
          <p className="text-sm text-muted">{t('seats.full')}</p>
        ) : null}
      </section>

      <section aria-labelledby="usage-heading" className="flex flex-col gap-2">
        <h2 id="usage-heading" className="text-lg font-semibold">
          {t('usage.title', { month: usage.month })}
        </h2>
        <p className="text-sm">{t('usage.cost', { cost: usd(usage.aiCostUsd) })}</p>
        <p className="text-sm text-muted">
          {t('usage.reported', {
            cents: format.number(usage.reportedCents),
            when: day(usage.lastReportedAt),
          })}
        </p>
        {usage.failedReports > 0 ? (
          <p role="alert" className="text-sm text-danger">
            {t('usage.failed', { count: usage.failedReports })}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="invoices-heading" className="flex flex-col gap-2">
        <h2 id="invoices-heading" className="text-lg font-semibold">
          {t('invoices.title')}
        </h2>
        {invoices === null ? (
          <p className="text-sm text-muted">{t('invoices.unavailable')}</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted">{t('invoices.none')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('invoices.title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['period', 'amount', 'status', 'paid'] as const).map((key) => (
                  <th key={key} scope="col" className="px-3 py-2 font-medium">
                    {t(`invoices.columns.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-border">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {`${day(invoice.periodStart)} - ${day(invoice.periodEnd)}`}
                  </th>
                  <td className="px-3 py-2">{`${invoice.amount} ${invoice.currency}`}</td>
                  <td className="px-3 py-2">
                    <Badge>{invoice.status}</Badge>
                  </td>
                  <td className="px-3 py-2">{day(invoice.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
