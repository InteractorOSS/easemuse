// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { PLATFORM_ROLES, invitePlatformAdminInputSchema, type PlatformRole } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { InviteLinkDialog, type InviteLink } from '@/components/ui/invite-link-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { PlatformAdmin, PlatformAdminInviteView } from '@/server/platform/admins';

type FormInput = z.input<typeof invitePlatformAdminInputSchema>;
type FormOutput = z.output<typeof invitePlatformAdminInputSchema>;

/** /admin/admins (owners only, US-1603): who has platform access, invitations, role changes and removal. */
export function AdminsView({ currentUserId }: { currentUserId: string }) {
  const t = useTranslations('admin.admins');
  const roles = useTranslations('admin.roles');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [link, setLink] = useState<InviteLink | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: ({ signal }) =>
      apiFetch<{ admins: PlatformAdmin[]; invites: PlatformAdminInviteView[] }>(
        '/api/admin/v1/admins',
        { signal },
      ),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'admins'] });
  const explain = (e: unknown) => {
    if (e instanceof ApiClientError && e.code === 'last_owner') return t('errors.lastOwner');
    if (e instanceof ApiClientError && e.code === 'already_admin') return t('errors.alreadyAdmin');
    if (e instanceof ApiClientError && e.code === 'invite_already_pending')
      return t('errors.alreadyPending');
    return t('errors.generic');
  };

  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: PlatformRole }) =>
      apiFetch(`/api/admin/v1/admins/${v.userId}`, { method: 'PATCH', body: { role: v.role } }),
    onSuccess: refresh,
    onError: (e) => toast({ title: explain(e), variant: 'danger' }),
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/admin/v1/admins/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast({ title: t('removed') });
      await refresh();
    },
    onError: (e) => toast({ title: explain(e), variant: 'danger' }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/v1/admin-invites/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => toast({ title: explain(e), variant: 'danger' }),
  });

  const data = query.data?.data;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <InviteDialog
          onCreated={async (result) => {
            setLink(result);
            await refresh();
          }}
          explain={explain}
        />
      </div>

      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {data && data.admins.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      {data && data.admins.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['name', 'email', 'role', 'actions'] as const).map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 font-medium">
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.admins.map((a) => {
                const display = a.name ?? a.email;
                return (
                  <tr key={a.userId} className="border-b border-border">
                    <th scope="row" className="px-3 py-2 font-medium">
                      {display}
                      {a.userId === currentUserId ? ` (${t('you')})` : ''}
                    </th>
                    <td className="px-3 py-2">{a.email}</td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={t('changeRole', { name: display })}
                        value={a.role}
                        disabled={changeRole.isPending}
                        onChange={(e) =>
                          changeRole.mutate({
                            userId: a.userId,
                            role: e.target.value as PlatformRole,
                          })
                        }
                        className="h-9 rounded-md border border-border bg-background px-2"
                      >
                        {PLATFORM_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roles(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={remove.isPending}
                        aria-label={t('removeFor', { name: display })}
                        onClick={() => remove.mutate(a.userId)}
                      >
                        {t('remove')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <section aria-labelledby="admin-invites-heading" className="flex flex-col gap-3">
        <h2 id="admin-invites-heading" className="text-lg font-semibold">
          {t('pending.title')}
        </h2>
        {data && data.invites.length === 0 ? (
          <p className="text-muted">{t('pending.empty')}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {data?.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">{i.email}</span>
              <span>{roles(i.role)}</span>
              <span className="text-muted">
                {t('pending.expires', {
                  date: format.dateTime(new Date(i.expiresAt), { dateStyle: 'medium' }),
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('pending.revokeFor', { email: i.email })}
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(i.id)}
              >
                {t('pending.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <InviteLinkDialog link={link} onClose={() => setLink(null)} />
    </div>
  );
}

function InviteDialog({
  onCreated,
  explain,
}: {
  onCreated: (r: { email: string; url: string }) => void | Promise<void>;
  explain: (e: unknown) => string;
}) {
  const t = useTranslations('admin.admins');
  const roles = useTranslations('admin.roles');
  const common = useTranslations('common.actions');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(invitePlatformAdminInputSchema),
    defaultValues: { email: '', role: 'support' },
  });
  const invite = useMutation({
    mutationFn: (input: FormOutput) =>
      apiFetch<{ acceptUrl: string }>('/api/admin/v1/admins', { body: input }),
    onSuccess: async (res, input) => {
      form.reset();
      setOpen(false);
      await onCreated({ email: input.email, url: res.data.acceptUrl });
    },
    onError: (e) => setError(explain(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>{t('invite')}</Button>
      </DialogTrigger>
      <DialogContent title={t('form.title')} description={t('form.description')}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((v) => {
            setError(null);
            invite.mutate(v);
          })}
        >
          <TextField
            label={t('form.email')}
            type="email"
            autoComplete="off"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
          <SelectField label={t('form.role')} {...form.register('role')}>
            {PLATFORM_ROLES.map((r) => (
              <option key={r} value={r}>
                {roles(r)}
              </option>
            ))}
          </SelectField>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {common('cancel')}
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {t('form.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
