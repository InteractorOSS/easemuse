// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FEATURE_FLAG_KEYS, type FeatureFlag } from '@easemuse/core';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { AgencyFeatures } from '@/server/platform/config';

/** /admin → one agency → Features: switch the agency's feature flags (owner or admin). Each change is logged. */
export function FeatureFlagsPanel({ agencyId, canWrite }: { agencyId: string; canWrite: boolean }) {
  const t = useTranslations('admin.agencies.features');
  const names = useTranslations('admin.config.flags');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const path = `/api/admin/v1/agencies/${agencyId}/features`;
  const query = useQuery({
    queryKey: ['admin', 'features', agencyId],
    queryFn: ({ signal }) => apiFetch<AgencyFeatures>(path, { signal }),
  });
  const change = useMutation({
    mutationFn: (input: { flag: FeatureFlag; enabled: boolean }) =>
      apiFetch(path, { method: 'PUT', body: input }),
    onSuccess: async () => {
      toast({ title: t('saved') });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'features', agencyId] });
    },
    onError: () => toast({ title: t('failed'), variant: 'danger' }),
  });
  if (!query.data) return null;
  const flags = query.data.data.flags;
  return (
    <section aria-labelledby="features-heading" className="flex max-w-xl flex-col gap-2">
      <h2 id="features-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro')}</p>
      <ul className="flex flex-col gap-2">
        {FEATURE_FLAG_KEYS.map((key) => (
          <li key={key}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={flags[key]}
                disabled={!canWrite || change.isPending}
                onChange={(event) => change.mutate({ flag: key, enabled: event.target.checked })}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{names(`names.${key}`)}</span>
                <br />
                <span className="text-muted">{names(`about.${key}`)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
