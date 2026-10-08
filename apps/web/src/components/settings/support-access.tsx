// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { SupportOverview } from '@/server/support/access';

/**
 * Settings → Support access (admin): who at Team of Wakers asked to look into this workspace, approve
 * or deny a request, revoke an active grant at any time, and see every page read under a grant
 * (FR-TEN-07, FR-ADM-07). Support can only read; nothing here is ever shared without this approval.
 */
export function SupportAccess({ agencyId }: { agencyId: string }) {
  const t = useTranslations('settings.support');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const path = `/api/v1/agencies/${agencyId}/support-access`;
  const when = (value: string | Date) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  const query = useQuery({
    queryKey: ['support-access', agencyId],
    queryFn: ({ signal }) => apiFetch<SupportOverview>(path, { signal }),
  });
  const decide = useMutation({
    mutationFn: (input: { grantId: string; decision: 'approve' | 'deny' | 'revoke' }) =>
      apiFetch(`${path}/${input.grantId}/decision`, {
        body: { decision: input.decision },
      }),
    onSuccess: async (_data, input) => {
      toast({ title: t(`decided.${input.decision}`) });
      await queryClient.invalidateQueries({ queryKey: ['support-access', agencyId] });
    },
    onError: () => toast({ title: t('failed'), variant: 'danger' }),
  });

  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  const { grants, views } = query.data.data;

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>

      <section aria-labelledby="grants-heading" className="flex flex-col gap-3">
        <h2 id="grants-heading" className="text-lg font-semibold">
          {t('grants.title')}
        </h2>
        {grants.length === 0 ? (
          <p className="text-muted">{t('grants.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {grants.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-col gap-2 rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{grant.adminEmail ?? t('unknownAdmin')}</span>
                  <Badge variant={grant.status === 'pending' ? 'draft' : 'neutral'}>
                    {t(`status.${grant.status}`)}
                  </Badge>
                </div>
                <p className="text-sm">{grant.reason}</p>
                <p className="text-xs text-muted">
                  {t('requested', { when: when(grant.createdAt), hours: grant.requestedHours })}
                  {grant.expiresAt ? ` ${t('until', { when: when(grant.expiresAt) })}` : ''}
                </p>
                {grant.status === 'pending' ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ grantId: grant.id, decision: 'approve' })}
                    >
                      {t('approve', { hours: grant.requestedHours })}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ grantId: grant.id, decision: 'deny' })}
                    >
                      {t('deny')}
                    </Button>
                  </div>
                ) : null}
                {grant.status === 'active' ? (
                  <div>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ grantId: grant.id, decision: 'revoke' })}
                    >
                      {t('revoke')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="views-heading" className="flex flex-col gap-3">
        <h2 id="views-heading" className="text-lg font-semibold">
          {t('views.title')}
        </h2>
        <p className="text-sm text-muted">{t('views.intro')}</p>
        {views.length === 0 ? (
          <p className="text-muted">{t('views.empty')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('views.title')}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('views.when')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('views.who')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('views.what')}
                </th>
              </tr>
            </thead>
            <tbody>
              {views.map((view) => (
                <tr key={view.id} className="border-b border-border">
                  <td className="px-3 py-2">{when(view.at)}</td>
                  <td className="px-3 py-2">{view.adminEmail ?? t('unknownAdmin')}</td>
                  <td className="px-3 py-2 font-mono text-xs break-all">
                    {view.method} {view.path}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
