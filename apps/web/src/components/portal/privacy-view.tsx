// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PRIVACY_DEADLINE_DAYS, PRIVACY_KINDS } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiClientError, apiFetch } from '@/lib/api-client';

/** The candidate asks for a copy of their data or for its deletion (FR-CDP-06). */
export function PrivacyView({ slug }: { slug: string }) {
  const t = useTranslations('portal.privacy');
  const [kind, setKind] = useState<(typeof PRIVACY_KINDS)[number]>('export');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'open' | 'error'>('idle');
  const send = useMutation({
    mutationFn: () =>
      apiFetch(`/api/portal/v1/${slug}/privacy-requests`, {
        body: { kind, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: () => setState('sent'),
    onError: (e) => setState(e instanceof ApiClientError && e.status === 409 ? 'open' : 'error'),
  });
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro', { days: PRIVACY_DEADLINE_DAYS })}</p>
      </div>
      {state === 'sent' ? (
        <p role="status">{t('sent', { days: PRIVACY_DEADLINE_DAYS })}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {state === 'open' ? <p role="alert">{t('open')}</p> : null}
          <SelectField
            label={t('title')}
            value={kind}
            onChange={(e) => setKind(e.target.value as 'export')}
          >
            {PRIVACY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(k)}
              </option>
            ))}
          </SelectField>
          {kind === 'delete' ? <p className="text-sm text-muted">{t('deleteWarn')}</p> : null}
          <TextField label={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
          <div>
            <Button disabled={send.isPending} onClick={() => send.mutate()}>
              {t('send')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
