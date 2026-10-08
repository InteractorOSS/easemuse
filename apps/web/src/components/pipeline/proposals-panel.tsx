// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AgencySettings } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { ProposalView } from '@/server/portal/proposals';

/** The hiring manager's proposals for this candidate. Nothing moves until the recruiter accepts one (FR-HMP-05). */
export function ProposalsPanel({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.portalAdmin');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;
  const key = ['proposals', agencyId];
  const [reasonCode, setReasonCode] = useState('');
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<ProposalView[]>(`${base}/proposed-transitions`, { signal }),
  });
  const mine = (list.data?.data ?? []).filter((p) => p.entryId === entryId);
  const needsCode = mine.some((p) => p.toState === 'client_rejected' || p.toState === 'rejected');
  const settings = useQuery({
    queryKey: ['settings', agencyId],
    queryFn: ({ signal }) => apiFetch<AgencySettings>(`${base}/settings`, { signal }),
    enabled: needsCode,
  });
  const resolve = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) =>
      apiFetch(`${base}/proposed-transitions/${v.id}/resolve`, {
        body: { accept: v.accept, ...(reasonCode ? { reasonCode } : {}) },
      }),
    onSuccess: async () => {
      toast({ title: t('resolved') });
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-entry', agencyId, entryId] });
      await onChanged();
    },
    onError: (e) => toast({ title: e instanceof ApiClientError ? e.message : t('error') }),
  });
  if (mine.length === 0) return null;
  return (
    <section aria-label={t('proposals')} className="flex max-w-3xl flex-col gap-3">
      <h3 className="font-medium">{t('proposals')}</h3>
      {mine.map((p) => (
        <div key={p.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="font-medium">
            {t('proposalLine', {
              who: p.proposedBy ?? '',
              state: t(`states.${p.toState as 'interviewing'}`),
            })}
          </p>
          {p.reason ? <p className="text-sm">{t('proposalReason', { reason: p.reason })}</p> : null}
          {p.toState === 'client_rejected' || p.toState === 'rejected' ? (
            <SelectField
              label={t('reasonCode')}
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              <option value="" />
              {(settings.data?.data.rejectionReasons ?? []).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectField>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: p.id, accept: true })}
            >
              {t('accept')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: p.id, accept: false })}
            >
              {t('decline')}
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
