// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BillingSummary } from '@/components/billing/billing-summary';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { BillingOverview } from '@/server/billing/service';
import type { BillingPlan } from '@/server/billing/types';

/** /admin → one agency → Plan and billing: plan, seats, usage and invoices, and putting the agency on a plan (US-1308). */
export function AdminBillingPanel({ agencyId, canWrite }: { agencyId: string; canWrite: boolean }) {
  const t = useTranslations('admin.agencies.billing');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState('');
  const path = `/api/admin/v1/agencies/${agencyId}/billing`;
  const query = useQuery({
    queryKey: ['admin', 'billing', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<{ overview: BillingOverview; plans: BillingPlan[] | null }>(path, { signal }),
  });
  const done = async (title: string) => {
    toast({ title });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'billing', agencyId] });
  };
  const failure = (error: unknown) =>
    toast({
      title:
        error instanceof ApiClientError && error.code === 'plan_change_unsupported'
          ? t('changeInBilling')
          : t('failed'),
      variant: 'danger',
    });
  const assign = useMutation({
    mutationFn: () => apiFetch(`${path}/plan`, { body: { planId } }),
    onSuccess: () => done(t('assigned')),
    onError: failure,
  });
  const refresh = useMutation({
    mutationFn: () => apiFetch(`${path}/refresh`, { body: {} }),
    onSuccess: () => done(t('refreshed')),
    onError: failure,
  });
  if (!query.data) return null;
  const { overview, plans } = query.data.data;

  return (
    <section aria-labelledby="billing-heading" className="flex max-w-3xl flex-col gap-4">
      <h2 id="billing-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <BillingSummary overview={overview} />
      {canWrite && overview.connected ? (
        <div className="flex flex-wrap items-end gap-3">
          {plans ? (
            <>
              <div className="w-64">
                <SelectField
                  label={t('plan')}
                  value={planId}
                  onChange={(event) => setPlanId(event.target.value)}
                >
                  <option value="">{t('choose')}</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <Button disabled={!planId || assign.isPending} onClick={() => assign.mutate()}>
                {t('assign')}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted">{t('plansUnavailable')}</p>
          )}
          <Button variant="secondary" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {t('refresh')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
