// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiFetch } from '@/lib/api-client';

const REASONS: Record<string, 'expired' | 'wrongEmail' | 'used'> = {
  invite_expired: 'expired',
  forbidden: 'wrongEmail',
  invite_already_accepted: 'used',
};

/** Accept button for a platform-administrator invitation (signed-in users only; the page redirects others). */
export function AcceptAdminInvite({ token }: { token: string }) {
  const t = useTranslations('admin.admins.accept');
  const router = useRouter();
  const [state, setState] = useState<
    { kind: 'idle' | 'working' } | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  async function accept() {
    setState({ kind: 'working' });
    try {
      await apiFetch('/api/v1/platform-invites/accept', { body: { token } });
      router.push('/admin');
    } catch (error) {
      const reason = error instanceof ApiClientError ? REASONS[error.code] : undefined;
      setState({
        kind: 'error',
        message: reason
          ? t(reason)
          : t('failed', { reason: error instanceof ApiClientError ? error.message : '' }),
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {state.kind === 'error' ? (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      ) : null}
      <div>
        <Button onClick={() => void accept()} disabled={state.kind === 'working'}>
          {state.kind === 'working' ? t('working') : t('action')}
        </Button>
      </div>
    </div>
  );
}
