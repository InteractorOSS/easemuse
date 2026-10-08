// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { SlotProposalView } from '@/server/portal/resolve-extras';

/**
 * The interview times the hiring manager offered for this candidate (FR-HMP-06). Confirming one
 * creates the interview round; declining closes the offer. Nothing is scheduled by the portal.
 */
export function SlotProposalsPanel({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.portalAdmin.slots');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;
  const key = ['slot-proposals', agencyId];
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      apiFetch<SlotProposalView[]>(`${base}/interview-slot-proposals`, { signal }),
  });
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [interviewers, setInterviewers] = useState<Record<string, string>>({});
  const resolve = useMutation({
    mutationFn: (v: { id: string; slotIndex: number | null }) =>
      apiFetch(`${base}/interview-slot-proposals/${v.id}/resolve`, {
        body:
          v.slotIndex === null
            ? { decision: 'decline' }
            : {
                decision: 'confirm',
                slotIndex: v.slotIndex,
                interviewers: (interviewers[v.id] ?? '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
      }),
    onSuccess: async () => {
      toast({ title: t('done') });
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({ queryKey: ['interviews', agencyId, entryId] });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-entry', agencyId, entryId] });
      await onChanged();
    },
    onError: (e) =>
      toast({
        title:
          e instanceof ApiClientError && e.status === 409 && e.code === 'conflict'
            ? t('passed')
            : t('error'),
      }),
  });
  const mine = (list.data?.data ?? []).filter((p) => p.entryId === entryId);
  if (mine.length === 0) return null;
  return (
    <section aria-label={t('title')} className="flex max-w-3xl flex-col gap-3">
      <h3 className="font-medium">{t('title')}</h3>
      {mine.map((p) => {
        const choice = picked[p.id] ?? 0;
        const name = `slot-${p.id}`;
        return (
          <div key={p.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <p className="font-medium">
              {t('line', {
                who: p.proposedBy ?? t('unknownWho'),
                round: p.roundName ?? t('nextRound'),
              })}
            </p>
            {p.note ? <p className="text-sm">{t('note', { note: p.note })}</p> : null}
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium">{t('pick')}</legend>
              {p.slots.map((slot, i) => (
                <label key={slot} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={name}
                    checked={choice === i}
                    onChange={() => setPicked((s) => ({ ...s, [p.id]: i }))}
                  />
                  {format.dateTime(new Date(slot), { dateStyle: 'full', timeStyle: 'short' })}
                </label>
              ))}
            </fieldset>
            <div className="max-w-md">
              <TextField
                label={t('interviewers')}
                value={interviewers[p.id] ?? ''}
                onChange={(e) => setInterviewers((s) => ({ ...s, [p.id]: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: p.id, slotIndex: choice })}
              >
                {t('confirm')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: p.id, slotIndex: null })}
              >
                {t('decline')}
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
