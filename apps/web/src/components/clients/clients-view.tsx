// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { clientInputSchema, contactInputSchema } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { ClientView } from '@/server/clients/service';

type ClientForm = z.input<typeof clientInputSchema>;
type ContactForm = z.input<typeof contactInputSchema>;

/** /a/:agency/clients (US-101): the agency's clients, their contacts, create and archive. */
export function ClientsView({
  agencyId,
  initialSearch = '',
}: {
  agencyId: string;
  initialSearch?: string;
}) {
  const t = useTranslations('clients');
  const states = useTranslations('common.states');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(initialSearch);
  const [includeArchived, setIncludeArchived] = useState(false);

  const query = useQuery({
    queryKey: ['clients', agencyId, search, includeArchived],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        limit: '100',
        includeArchived: String(includeArchived),
      });
      if (search.trim()) params.set('q', search.trim());
      return apiFetch<ClientView[]>(`/api/v1/agencies/${agencyId}/clients?${params}`, { signal });
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['clients', agencyId] });
  const explain = (e: unknown) =>
    e instanceof ApiClientError && e.status === 409
      ? t('errors.contactInUse')
      : t('errors.generic');
  const archive = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) =>
      apiFetch(`/api/v1/agencies/${agencyId}/clients/${v.id}`, {
        method: 'PATCH',
        body: { archived: v.archived },
      }),
    onSuccess: refresh,
    onError: (e) => toast({ title: explain(e), variant: 'danger' }),
  });

  const clients = query.data?.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <NewClientDialog
          agencyId={agencyId}
          onCreated={async (similar) => {
            if (similar) toast({ title: t('form.similar', { name: similar }) });
            await refresh();
          }}
        />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <TextField
          label={t('search')}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          {t('showArchived')}
        </label>
      </div>

      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && clients.length === 0 ? (
        <p className="text-muted">{search ? t('emptySearch') : t('empty')}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {clients.map((client) => (
          <li key={client.id} className="rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">
                  {client.name}
                  {client.archivedAt ? (
                    <span className="ml-2 text-sm text-muted">{t('archivedBadge')}</span>
                  ) : null}
                </h2>
                <p className="text-sm text-muted">
                  {t('positions', { count: client.positionCount })}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={archive.isPending}
                aria-label={
                  client.archivedAt
                    ? t('restoreFor', { name: client.name })
                    : t('archiveFor', { name: client.name })
                }
                onClick={() => archive.mutate({ id: client.id, archived: !client.archivedAt })}
              >
                {client.archivedAt ? t('restore') : t('archive')}
              </Button>
            </div>
            <Contacts agencyId={agencyId} client={client} onChange={refresh} explain={explain} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewClientDialog({
  agencyId,
  onCreated,
}: {
  agencyId: string;
  onCreated: (similarName: string | null) => void | Promise<void>;
}) {
  const root = useTranslations('clients');
  const t = useTranslations('clients.form');
  const common = useTranslations('common.actions');
  const errors = useTranslations('clients.errors');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ClientForm>({
    resolver: zodResolver(clientInputSchema),
    defaultValues: { name: '' },
  });
  const create = useMutation({
    mutationFn: (input: ClientForm) =>
      apiFetch<{ client: ClientView; similar: { id: string; name: string }[] }>(
        `/api/v1/agencies/${agencyId}/clients`,
        { body: input },
      ),
    onSuccess: async (res) => {
      form.reset();
      setOpen(false);
      await onCreated(res.data.similar[0]?.name ?? null);
    },
    onError: () => setError(errors('generic')),
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
        <Button>{root('new')}</Button>
      </DialogTrigger>
      <DialogContent title={t('title')} description={t('description')}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((v) => {
            setError(null);
            create.mutate(v);
          })}
        >
          <TextField
            label={t('name')}
            autoComplete="off"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
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
            <Button type="submit" disabled={create.isPending}>
              {t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Contacts({
  agencyId,
  client,
  onChange,
  explain,
}: {
  agencyId: string;
  client: ClientView;
  onChange: () => Promise<unknown>;
  explain: (e: unknown) => string;
}) {
  const t = useTranslations('clients.contacts');
  const f = useTranslations('clients.contactForm');
  const { toast } = useToast();
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactInputSchema),
    defaultValues: { name: '', title: '', email: '', phone: '' },
  });
  const base = `/api/v1/agencies/${agencyId}/clients/${client.id}/contacts`;
  const add = useMutation({
    mutationFn: (input: ContactForm) => apiFetch(base, { body: input }),
    onSuccess: async () => {
      form.reset();
      toast({ title: t('added') });
      await onChange();
    },
    onError: (e) => toast({ title: explain(e), variant: 'danger' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast({ title: t('removed') });
      await onChange();
    },
    onError: (e) => toast({ title: explain(e), variant: 'danger' }),
  });
  return (
    <section aria-label={t('show', { name: client.name })} className="mt-3 flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('title')}</h3>
      {client.contacts.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
      <ul className="flex flex-col gap-1 text-sm">
        {client.contacts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3">
            <span className="font-medium">{c.name}</span>
            {c.title ? <span>{c.title}</span> : null}
            {c.email ? <span className="text-muted">{c.email}</span> : null}
            {c.phone ? <span className="text-muted">{c.phone}</span> : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              aria-label={t('removeFor', { name: c.name })}
              onClick={() => remove.mutate(c.id)}
            >
              {t('remove')}
            </Button>
          </li>
        ))}
      </ul>
      {client.archivedAt ? null : (
        <form
          noValidate
          aria-label={t('add')}
          className="flex flex-wrap items-end gap-2"
          onSubmit={form.handleSubmit((v) => add.mutate(v))}
        >
          <TextField
            label={f('name')}
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <TextField label={f('title')} {...form.register('title')} />
          <TextField
            label={f('email')}
            type="email"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
          <TextField
            label={f('phone')}
            type="tel"
            error={form.formState.errors.phone?.message}
            {...form.register('phone')}
          />
          <Button type="submit" size="sm" disabled={add.isPending}>
            {f('submit')}
          </Button>
        </form>
      )}
    </section>
  );
}
