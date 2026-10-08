// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { createAgencyInputSchema, REGIONS } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { InviteLinkDialog, type InviteLink } from '@/components/ui/invite-link-dialog';
import { useToast } from '@/components/ui/toast';
import { apiFetch, ApiClientError } from '@/lib/api-client';

type FormInput = z.input<typeof createAgencyInputSchema>;
type FormOutput = z.output<typeof createAgencyInputSchema>;

/** Create an agency and invite its first admin (FR-TEN-02). */
export function AgencyCreateDialog() {
  const t = useTranslations('admin');
  const common = useTranslations('common.actions');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<InviteLink | null>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createAgencyInputSchema),
    defaultValues: { name: '', slug: '', adminEmail: '', region: 'us' },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: FormOutput) =>
      apiFetch<{ acceptUrl: string }>('/api/admin/v1/agencies', { body: input }),
    onSuccess: async (result, input) => {
      toast({ title: t('agencies.created', { email: input.adminEmail }) });
      setLink({ email: input.adminEmail, url: result.data.acceptUrl });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agencies'] });
      form.reset();
      setOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && Object.keys(error.fields).length > 0) {
        for (const [field, message] of Object.entries(error.fields)) {
          form.setError(field as keyof FormInput, {
            message:
              field === 'slug' && error.code === 'slug_taken' ? t('errors.slugTaken') : message,
          });
        }
      } else {
        setFormError(t('errors.generic'));
      }
    },
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            form.reset();
            setFormError(null);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button>{t('agencies.create')}</Button>
        </DialogTrigger>
        <DialogContent
          title={t('agencies.form.title')}
          description={t('agencies.form.description')}
        >
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => {
              setFormError(null);
              create.mutate(values);
            })}
          >
            <TextField
              label={t('agencies.form.name')}
              error={form.formState.errors.name?.message}
              autoComplete="off"
              {...form.register('name')}
            />
            <TextField
              label={t('agencies.form.slug')}
              hint={t('agencies.form.slugHint')}
              error={form.formState.errors.slug?.message}
              autoComplete="off"
              {...form.register('slug')}
            />
            <TextField
              label={t('agencies.form.adminEmail')}
              type="email"
              error={form.formState.errors.adminEmail?.message}
              autoComplete="off"
              {...form.register('adminEmail')}
            />
            <SelectField label={t('agencies.form.region')} {...form.register('region')}>
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region.toUpperCase()}
                </option>
              ))}
            </SelectField>
            {formError ? (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {common('cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {t('agencies.form.submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <InviteLinkDialog link={link} onClose={() => setLink(null)} />
    </>
  );
}
