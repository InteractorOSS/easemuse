// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { BillingSummary } from '@/components/billing/billing-summary';
import { apiFetch } from '@/lib/api-client';
import type { BillingOverview } from '@/server/billing/service';

/** Settings → Plan and seats (admin): the plan, seats used, this month's usage and invoices (US-1308). */
export function PlanAndSeats({ agencyId }: { agencyId: string }) {
  const t = useTranslations('settings.billing');
  const states = useTranslations('common.states');
  const query = useQuery({
    queryKey: ['billing', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<BillingOverview>(`/api/v1/agencies/${agencyId}/billing`, { signal }),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>
      <BillingSummary overview={query.data.data} />
    </div>
  );
}
