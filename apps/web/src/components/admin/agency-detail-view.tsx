// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BudgetEditor } from './budget-editor';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { AgencyDetail } from '@/server/tenancy/agencies';

/** One agency: metadata, counts, and (for owners and admins) suspend / reactivate with a reason. */
export function AgencyDetailView({ agencyId, canWrite }: { agencyId: string; canWrite: boolean }) {
  const t = useTranslations('admin.agencies');
  const common = useTranslations('common.actions');
  const states = useTranslations('common.states');
  const errors = useTranslations('admin.errors');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['admin', 'agency', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<AgencyDetail>(`/api/admin/v1/agencies/${agencyId}`, { signal }),
  });
  const agency = detail.data?.data;
  const suspended = agency?.status === 'suspended';

  const change = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/v1/agencies/${agencyId}/${suspended ? 'reactivate' : 'suspend'}`, {
        body: { reason },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      setOpen(false);
      setReason('');
      toast({ title: suspended ? t('status.active') : t('status.suspended') });
    },
    onError: () => setError(errors('generic')),
  });

  if (detail.isPending) return <p role="status">{states('loading')}</p>;
  if (detail.isError || !agency) return <p role="alert">{states('error')}</p>;

  const title = suspended
    ? t('detail.reactivateTitle', { agency: agency.name })
    : t('detail.suspendTitle', { agency: agency.name });
  const canChange =
    canWrite && (agency.status === 'active' || agency.status === 'trial' || suspended);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/agencies" className="text-sm underline">
        {t('detail.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{agency.name}</h1>
        <Badge variant={suspended ? 'draft' : 'neutral'}>{t(`status.${agency.status}`)}</Badge>
      </div>

      <dl className="grid max-w-xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">{t('columns.slug')}</dt>
        <dd>{agency.slug}</dd>
        <dt className="text-muted">{t('columns.region')}</dt>
        <dd>{agency.region.toUpperCase()}</dd>
        <dt className="text-muted">{t('detail.members')}</dt>
        <dd>{agency.activeMembers}</dd>
        <dt className="text-muted">{t('detail.invites')}</dt>
        <dd>{agency.pendingInvites}</dd>
        <dt className="text-muted">{t('detail.created')}</dt>
        <dd>{format.dateTime(new Date(agency.createdAt), { dateStyle: 'medium' })}</dd>
      </dl>

      <BudgetEditor
        key={`${agency.budget.limitUsd}-${agency.budget.spentUsd}`}
        agencyId={agency.id}
        budget={agency.budget}
        canWrite={canWrite}
      />

      {canChange ? (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            setError(null);
          }}
        >
          <div>
            <DialogTrigger asChild>
              <Button variant={suspended ? 'primary' : 'danger'}>
                {suspended ? t('detail.reactivate') : t('detail.suspend')}
              </Button>
            </DialogTrigger>
          </div>
          <DialogContent
            title={title}
            description={suspended ? undefined : t('detail.suspendDescription')}
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                change.mutate();
              }}
            >
              <TextField
                label={t('detail.reason')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={500}
                required
              />
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  {common('cancel')}
                </Button>
                <Button
                  type="submit"
                  variant={suspended ? 'primary' : 'danger'}
                  disabled={change.isPending || reason.trim().length < 3}
                >
                  {suspended ? t('detail.reactivate') : t('detail.suspend')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
