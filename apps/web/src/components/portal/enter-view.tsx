// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PORTAL_AUDIENCES } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiClientError, apiFetch } from '@/lib/api-client';

type Phase = 'working' | 'invalid' | 'expired' | 'ask' | 'sent';

/**
 * Opens a portal from the emailed link. The token is in the URL fragment, so it never reaches a server
 * log: this page reads it, trades it for a session once, and removes it from the address bar. A link
 * that is used up or expired offers a new one by email.
 */
export function EnterView({
  slug,
  prefix,
  audience,
}: {
  slug: string;
  prefix: 'h' | 'c';
  audience: (typeof PORTAL_AUDIENCES)[number];
}) {
  const t = useTranslations('portal.enter');
  const [phase, setPhase] = useState<Phase>('working');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      void Promise.resolve().then(() => setPhase('ask'));
      return;
    }
    apiFetch(`/api/public/portal/${slug}/redeem`, { body: { token } })
      .then(() => window.location.replace(`/${prefix}/${slug}`))
      .catch((e: unknown) =>
        setPhase(
          e instanceof ApiClientError && e.status === 410
            ? 'expired'
            : e instanceof ApiClientError && e.status === 409
              ? 'expired'
              : 'invalid',
        ),
      );
  }, [slug, prefix]);

  const send = async () => {
    setError(null);
    try {
      await apiFetch(`/api/public/portal/${slug}/relogin`, {
        body: { email: email.trim(), audience },
      });
      setPhase('sent');
    } catch {
      setError(t('error'));
    }
  };

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {phase === 'working' ? <p role="status">{t('working')}</p> : null}
      {phase === 'invalid' || phase === 'expired' ? (
        <p role="alert">{phase === 'expired' ? t('expired') : t('invalid')}</p>
      ) : null}
      {phase === 'sent' ? <p role="status">{t('sent')}</p> : null}
      {phase === 'invalid' || phase === 'expired' || phase === 'ask' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{t('needNew')}</p>
          <TextField
            label={t('email')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Button disabled={!/.+@.+\..+/.test(email)} onClick={() => void send()}>
              {t('send')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
