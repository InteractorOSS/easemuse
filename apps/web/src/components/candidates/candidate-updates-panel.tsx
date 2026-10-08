// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CANDIDATE_UPDATE_FIELDS } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { CandidateUpdateView } from '@/server/portal/resolve-extras';

/** What the candidate says changed about them, from the portal (FR-CDP-04). Nothing changes until a recruiter accepts. */
export function CandidateUpdatesPanel({
  agencyId,
  candidateId,
}: {
  agencyId: string;
  candidateId: string;
}) {
  const t = useTranslations('pipeline.portalAdmin.updates');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/candidates/${candidateId}/profile-updates`;
  const key = ['candidate-updates', agencyId, candidateId];
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<CandidateUpdateView[]>(base, { signal }),
  });
  const resolve = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) =>
      apiFetch(`${base}/${v.id}/resolve`, { body: { accept: v.accept } }),
    onSuccess: async () => {
      toast({ title: t('done') });
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({ queryKey: ['candidate', agencyId, candidateId] });
      await queryClient.invalidateQueries({
        queryKey: ['timeline', agencyId, 'candidate', candidateId],
      });
    },
    onError: (e) =>
      toast({
        title: e instanceof ApiClientError && e.status === 409 ? t('needsProfile') : t('error'),
      }),
  });
  const open = list.data?.data ?? [];
  if (open.length === 0) return null;
  return (
    <section aria-labelledby="cand-updates" className="flex max-w-2xl flex-col gap-3">
      <h2 id="cand-updates" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro')}</p>
      {open.map((u) => (
        <div key={u.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            {CANDIDATE_UPDATE_FIELDS.filter((f) => u.changes[f] !== undefined).map((f) => (
              <div key={f} className="contents">
                <dt className="text-muted">{t(`fields.${f}`)}</dt>
                <dd>{u.changes[f]}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: u.id, accept: true })}
            >
              {t('accept')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: u.id, accept: false })}
            >
              {t('decline')}
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
