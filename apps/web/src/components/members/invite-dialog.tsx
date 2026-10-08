// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AGENCY_ROLES, inviteMemberInputSchema } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { InviteLinkDialog, type InviteLink } from '@/components/ui/invite-link-dialog';
import { useToast } from '@/components/ui/toast';
import { apiFetch, ApiClientError } from '@/lib/api-client';

type FormInput = z.input<typeof inviteMemberInputSchema>;
type FormOutput = z.output<typeof inviteMemberInputSchema>;

/** Invite someone by email with a role; the link they receive works once (ADR-002). */
export function InviteDialog({ agencyId }: { agencyId: string }) {
  const t = useTranslations('members');
  const common = useTranslations('common.actions');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<InviteLink | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(inviteMemberInputSchema),
    defaultValues: { email: '', role: 'recruiter' },
  });

  const invite = useMutation({
    mutationFn: (input: FormOutput) =>
      apiFetch<{ acceptUrl: string }>(`/api/v1/agencies/${agencyId}/invites`, { body: input }),
    onSuccess: async (result, input) => {
      toast({ title: t('invited', { email: input.email }) });
      setLink({ email: input.email, url: result.data.acceptUrl });
      await queryClient.invalidateQueries({ queryKey: ['invites', agencyId] });
      form.reset();
      setOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'invite_already_pending') {
        form.setError('email', { message: t('errors.alreadyPending') });
      } else if (error instanceof ApiClientError && error.fields.email) {
        form.setError('email', { message: error.fields.email });
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
          <Button>{t('invite')}</Button>
        </DialogTrigger>
        <DialogContent title={t('inviteForm.title')} description={t('inviteForm.description')}>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => {
              setFormError(null);
              invite.mutate(values);
            })}
          >
            <TextField
              label={t('inviteForm.email')}
              type="email"
              autoComplete="off"
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />
            <SelectField label={t('inviteForm.role')} {...form.register('role')}>
              {AGENCY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
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
              <Button type="submit" disabled={invite.isPending}>
                {t('inviteForm.submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <InviteLinkDialog link={link} onClose={() => setLink(null)} />
    </>
  );
}
