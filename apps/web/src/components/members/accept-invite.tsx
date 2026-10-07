// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiClientError } from '@/lib/api-client';

const REASONS: Record<string, 'expired' | 'wrongEmail' | 'used'> = {
  invite_expired: 'expired',
  forbidden: 'wrongEmail',
  invite_already_accepted: 'used',
};

/** Accept button for an invitation link: signed-in users only (the page redirects others to sign-in). */
export function AcceptInvite({
  agencySlug,
  agencyName,
  token,
}: {
  agencySlug: string;
  agencyName: string;
  token: string;
}) {
  const t = useTranslations('members.accept');
  const router = useRouter();
  const [state, setState] = useState<
    { kind: 'idle' | 'working' } | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  async function accept() {
    setState({ kind: 'working' });
    try {
      await apiFetch(`/api/v1/invites/${encodeURIComponent(agencySlug)}/accept`, {
        body: { token },
      });
      router.push(`/a/${agencySlug}`);
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
      <h1 className="text-2xl font-semibold">{t('title', { agency: agencyName })}</h1>
      <p className="text-muted">{t('description', { agency: agencyName })}</p>
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
