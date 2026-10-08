// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { SHARE_AUDIENCE, type PortalShareKind } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { DirectoryPerson } from '@/server/portal/directory';
import type { ShareView } from '@/server/portal/publish';

type Subject = { kind: PortalShareKind; subjectId: string };
type Target = { positionId: string } | { entryId: string } | { candidateId: string };

/**
 * Invite people to the portal and share one approved item with them (ADR-003). The same screen serves
 * the JD for the hiring manager, a submission, and the resume for the candidate.
 */
export function PortalSharing({
  agencyId,
  target,
  subject,
  heading,
  onChanged,
}: {
  agencyId: string;
  target: Target;
  subject: Subject;
  heading: string;
  onChanged?: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.portalAdmin');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;
  const dirKey = ['portal-directory', agencyId, target];
  const shareKey = ['portal-shares', agencyId, subject.kind, subject.subjectId];
  const people = useQuery({
    queryKey: dirKey,
    queryFn: ({ signal }) =>
      apiFetch<DirectoryPerson[]>(
        `${base}/portal-users?${new URLSearchParams(target as Record<string, string>)}`,
        { signal },
      ),
  });
  const shares = useQuery({
    queryKey: shareKey,
    queryFn: ({ signal }) =>
      apiFetch<ShareView[]>(`${base}/portal-shares?${new URLSearchParams(subject)}`, { signal }),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: dirKey });
    await queryClient.invalidateQueries({ queryKey: shareKey });
    await onChanged?.();
  };
  const fail = (e: unknown) =>
    toast({ title: e instanceof ApiClientError ? e.message : t('error') });
  const audience = SHARE_AUDIENCE[subject.kind];
  const invite = useMutation({
    mutationFn: (p: DirectoryPerson) =>
      apiFetch(`${base}/portal-users`, {
        body:
          audience === 'candidate'
            ? { audience, candidateId: p.personId }
            : { audience, clientContactId: p.personId },
      }),
    onSuccess: async () => {
      toast({ title: t('invitedToast') });
      await refresh();
    },
    onError: fail,
  });
  const share = useMutation({
    mutationFn: (portalUserId: string) =>
      apiFetch(`${base}/portal-shares`, { body: { ...subject, portalUserId } }),
    onSuccess: async () => {
      toast({ title: t('sharedToast') });
      await refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/portal-shares/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast({ title: t('revoked') });
      await refresh();
    },
    onError: fail,
  });
  const list = people.data?.data ?? [];
  const active = (shares.data?.data ?? []).filter((s) => s.revokedAt === null);

  return (
    <section aria-label={heading} className="flex max-w-3xl flex-col gap-3">
      <h3 className="font-medium">{heading}</h3>
      {people.isSuccess && list.length === 0 ? (
        <p className="text-sm text-muted">{t('none')}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.map((p) => {
          const mine = p.portalUser
            ? active.find((s) => s.portalUserId === p.portalUser!.id)
            : undefined;
          return (
            <li
              key={p.personId}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
            >
              <span className="font-medium">
                {p.title ? t('contact', { name: p.name, title: p.title }) : p.name}
              </span>
              <span className="text-sm text-muted">
                {!p.hasEmail
                  ? t('noEmail')
                  : p.portalUser
                    ? p.portalUser.disabled
                      ? t('disabled')
                      : t('invited')
                    : ''}
                {mine
                  ? ` · ${t('sharedOn', { date: format.dateTime(new Date(mine.createdAt), { dateStyle: 'medium' }) })}`
                  : ''}
              </span>
              <span className="ml-auto flex gap-2">
                {!p.portalUser ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!p.hasEmail || invite.isPending}
                    onClick={() => invite.mutate(p)}
                  >
                    {t('invite')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={p.portalUser.disabled || share.isPending}
                    onClick={() => share.mutate(p.portalUser!.id)}
                  >
                    {mine ? t('shareAgain') : t('share')}
                  </Button>
                )}
                {mine ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(mine.id)}
                  >
                    {t('revoke')}
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
