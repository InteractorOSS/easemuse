// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { AGENCY_ROLES, type AgencyRole } from '@easemuse/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { Member, PendingInvite } from '@/server/tenancy/members';
import { InviteDialog } from './invite-dialog';

/** Settings → Members: everyone sees the list; admins invite, change roles and deactivate. */
export function MembersView({ agencyId, canManage }: { agencyId: string; canManage: boolean }) {
  const t = useTranslations('members');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;

  const members = useInfiniteQuery({
    queryKey: ['members', agencyId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiFetch<Member[]>(`${base}/members?limit=50${pageParam ? `&cursor=${pageParam}` : ''}`, {
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const invites = useQuery({
    queryKey: ['invites', agencyId],
    enabled: canManage,
    queryFn: ({ signal }) => apiFetch<PendingInvite[]>(`${base}/invites`, { signal }),
  });

  const errorText = (error: unknown): string => {
    if (error instanceof ApiClientError && error.code === 'last_admin')
      return t('errors.lastAdmin');
    return t('errors.generic');
  };

  const update = useMutation({
    mutationFn: (input: { userId: string; role?: AgencyRole; active?: boolean }) =>
      apiFetch(`${base}/members/${input.userId}`, {
        method: 'PATCH',
        body: { role: input.role, active: input.active },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', agencyId] }),
    onError: (error) => toast({ title: errorText(error), variant: 'danger' }),
  });
  const revoke = useMutation({
    mutationFn: (inviteId: string) => apiFetch(`${base}/invites/${inviteId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites', agencyId] }),
    onError: (error) => toast({ title: errorText(error), variant: 'danger' }),
  });

  const rows = members.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {canManage ? <InviteDialog agencyId={agencyId} /> : null}
      </div>

      {members.isPending ? <p role="status">{states('loading')}</p> : null}
      {members.isError ? <p role="alert">{states('error')}</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['name', 'email', 'role', 'status'] as const).map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 font-medium">
                    {t(`columns.${column}`)}
                  </th>
                ))}
                {canManage ? (
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('columns.actions')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => {
                const display = member.name ?? member.email;
                return (
                  <tr key={member.userId} className="border-b border-border">
                    <th scope="row" className="px-3 py-2 font-medium">
                      {display}
                    </th>
                    <td className="px-3 py-2">{member.email}</td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <select
                          aria-label={t('changeRole', { name: display })}
                          value={member.role}
                          disabled={update.isPending}
                          onChange={(event) =>
                            update.mutate({
                              userId: member.userId,
                              role: event.target.value as AgencyRole,
                            })
                          }
                          className="h-9 rounded-md border border-border bg-background px-2"
                        >
                          {AGENCY_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {t(`roles.${role}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        t(`roles.${member.role}`)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={member.active ? 'neutral' : 'draft'}>
                        {t(member.active ? 'status.active' : 'status.inactive')}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td className="px-3 py-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={update.isPending}
                          aria-label={
                            member.active
                              ? t('deactivateMember', { name: display })
                              : t('reactivateMember', { name: display })
                          }
                          onClick={() =>
                            update.mutate({ userId: member.userId, active: !member.active })
                          }
                        >
                          {member.active ? t('deactivate') : t('reactivate')}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {members.hasNextPage ? (
        <div>
          <Button variant="secondary" onClick={() => void members.fetchNextPage()}>
            {states('loadMore')}
          </Button>
        </div>
      ) : null}

      {canManage ? (
        <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
          <h2 id="pending-heading" className="text-lg font-semibold">
            {t('pending.title')}
          </h2>
          {invites.data && invites.data.data.length === 0 ? (
            <p className="text-muted">{t('pending.empty')}</p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {invites.data?.data.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{invite.email}</span>
                <Badge>{t(`roles.${invite.role}`)}</Badge>
                <span className="text-muted">
                  {t('pending.expires', {
                    date: format.dateTime(new Date(invite.expiresAt), { dateStyle: 'medium' }),
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.isPending}
                  aria-label={t('pending.revokeFor', { email: invite.email })}
                  onClick={() => revoke.mutate(invite.id)}
                >
                  {t('pending.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
