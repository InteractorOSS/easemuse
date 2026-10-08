// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import {
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  agencyBrandingPatchSchema,
  type AgencyBrandingPatch,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { BrandingView } from '@/server/branding/service';

/** Settings → Branding: display name, colour and logo, used by PDFs, Word files, portals and emails (FR-TEN-04). */
export function BrandingForm({
  agencyId,
  agencySlug,
  canEdit,
}: {
  agencyId: string;
  agencySlug: string;
  canEdit: boolean;
}) {
  const states = useTranslations('common.states');
  const path = `/api/v1/agencies/${agencyId}/branding`;
  const query = useQuery({
    queryKey: ['branding', agencyId],
    queryFn: ({ signal }) => apiFetch<BrandingView>(path, { signal }),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  return (
    <Form
      key={JSON.stringify(query.data.data)}
      agencyId={agencyId}
      agencySlug={agencySlug}
      initial={query.data.data}
      canEdit={canEdit}
      path={path}
    />
  );
}

function Form({
  agencyId,
  agencySlug,
  initial,
  canEdit,
  path,
}: {
  agencyId: string;
  agencySlug: string;
  initial: BrandingView;
  canEdit: boolean;
  path: string;
}) {
  const t = useTranslations('settings.branding');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(initial.displayName ?? '');
  const [color, setColor] = useState(initial.primaryColor);
  const [errors, setErrors] = useState<{ displayName?: string; color?: string; logo?: string }>({});

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['branding', agencyId] });
  const save = useMutation({
    mutationFn: (body: AgencyBrandingPatch) => apiFetch(path, { method: 'PATCH', body }),
    onSuccess: async () => {
      toast({ title: t('saved') });
      await refresh();
    },
    onError: () => setErrors({ displayName: t('failed') }),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch(`${path}/logo`, { method: 'PUT', body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { code?: string };
        } | null;
        throw new ApiClientError(response.status, body?.error?.code ?? 'unknown_error', 'Upload');
      }
    },
    onSuccess: async () => {
      toast({ title: t('logo.saved') });
      await refresh();
    },
    onError: (error) =>
      setErrors({
        logo:
          error instanceof ApiClientError && error.status === 413
            ? t('logo.tooLarge')
            : error instanceof ApiClientError && error.status === 415
              ? t('logo.wrongType')
              : error instanceof ApiClientError && error.status === 422
                ? t('logo.tooManyPixels')
                : t('failed'),
      }),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`${path}/logo`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast({ title: t('logo.removed') });
      await refresh();
    },
    onError: () => setErrors({ logo: t('failed') }),
  });

  function submit() {
    const patch = {
      displayName: displayName.trim() === '' ? null : displayName.trim(),
      primaryColor: color,
    };
    const checked = agencyBrandingPatchSchema.safeParse(patch);
    if (!checked.success) {
      const paths = checked.error.issues.map((i) => String(i.path[0]));
      setErrors({
        displayName: paths.includes('displayName') ? t('nameError') : undefined,
        color: paths.includes('primaryColor') ? t('colorError') : undefined,
      });
      return;
    }
    setErrors({});
    save.mutate(checked.data);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    setErrors({});
    if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setErrors({ logo: t('logo.wrongType') });
    } else if (file.size > LOGO_MAX_BYTES) {
      setErrors({ logo: t('logo.tooLarge') });
    } else {
      upload.mutate(file);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const shownName = displayName.trim() || initial.agencyName;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
        {canEdit ? null : <p className="text-sm text-muted">{t('readOnly')}</p>}
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          label={t('displayName')}
          hint={t('displayNameHint', { name: initial.agencyName })}
          value={displayName}
          maxLength={120}
          disabled={!canEdit}
          error={errors.displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label={t('color')}
            hint={t('colorHint')}
            value={color}
            maxLength={7}
            disabled={!canEdit}
            error={errors.color}
            className="w-32 font-mono"
            onChange={(event) => setColor(event.target.value)}
          />
          <input
            type="color"
            aria-label={t('colorPicker')}
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000'}
            disabled={!canEdit}
            className="h-10 w-12 rounded-md border border-border"
            onChange={(event) => setColor(event.target.value)}
          />
        </div>
        {canEdit ? (
          <div>
            <Button type="submit" disabled={save.isPending}>
              {t('save')}
            </Button>
          </div>
        ) : null}
      </form>

      <section aria-labelledby="logo-heading" className="flex flex-col gap-3">
        <h2 id="logo-heading" className="text-lg font-semibold">
          {t('logo.title')}
        </h2>
        <p className="text-sm text-muted">{t('logo.intro')}</p>
        {initial.logoFileId ? (
          // eslint-disable-next-line @next/next/no-img-element -- the logo is a stored image served by our own route
          <img
            src={`/api/public/agencies/${agencySlug}/logo?v=${initial.logoFileId}`}
            alt={t('logo.alt', { name: shownName })}
            className="max-h-16 max-w-xs self-start object-contain"
          />
        ) : (
          <p className="text-sm">{t('logo.none')}</p>
        )}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_CONTENT_TYPES.join(',')}
              aria-label={t('logo.choose')}
              disabled={upload.isPending}
              className="text-sm"
              onChange={(event) => pick(event.target.files?.[0])}
            />
            {initial.logoFileId ? (
              <Button
                variant="secondary"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t('logo.remove')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {errors.logo ? (
          <p role="alert" className="text-sm text-danger">
            {errors.logo}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="preview-heading" className="flex flex-col gap-2">
        <h2 id="preview-heading" className="text-lg font-semibold">
          {t('preview.title')}
        </h2>
        <div className="border-b-4 px-3 py-2" style={{ borderColor: color }}>
          <p className="font-semibold" style={{ color }}>
            {shownName}
          </p>
          <p className="text-sm text-muted">{t('preview.sample')}</p>
        </div>
      </section>
    </div>
  );
}
