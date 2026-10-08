// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import type { Me } from '@/server/tenancy/me';
import { SiteHeader } from './site-header';

const CARD =
  'flex h-full flex-col gap-1 rounded-xl border border-border bg-background p-5 hover:border-primary hover:bg-surface';

/**
 * Signed-in home for people with a choice to make (several agencies, or agencies plus the admin
 * console) or nothing to open yet. Single-destination users are redirected before this renders.
 */
export async function WorkspaceChooser({
  me,
  signOutAction,
  switchAccountAction,
}: {
  me: Me;
  signOutAction: () => Promise<void>;
  switchAccountAction: () => Promise<void>;
}) {
  const t = await getTranslations('home');
  const roles = await getTranslations('members.roles');
  const firstName = me.user.name?.split(' ')[0];
  const hasWorkspaces = me.memberships.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader appName={t('title')}>
        <span className="hidden text-sm text-muted sm:inline">{me.user.email}</span>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" size="sm">
            {t('signOut')}
          </Button>
        </form>
      </SiteHeader>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? t('workspaces.greetingName', { name: firstName }) : t('workspaces.greeting')}
        </h1>

        {hasWorkspaces || me.user.platformRole ? (
          <>
            <p className="mt-2 text-muted">{t('workspaces.lead')}</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {me.memberships.map((m) => (
                <li key={m.agencyId}>
                  <Link href={`/a/${m.slug}`} className={CARD}>
                    <span className="text-lg font-medium">{m.name}</span>
                    <span className="text-sm text-muted">{roles(m.role)}</span>
                  </Link>
                </li>
              ))}
              {me.user.platformRole && (
                <li>
                  <Link href="/admin" className={CARD}>
                    <span className="text-lg font-medium">{t('adminConsole')}</span>
                    <span className="text-sm text-muted">{t('workspaces.adminBody')}</span>
                  </Link>
                </li>
              )}
            </ul>
          </>
        ) : (
          <section className="mt-8 max-w-xl rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-medium">{t('noWorkspaceTitle')}</h2>
            <p className="mt-2 text-muted">{t('noWorkspaceBody')}</p>
            <p className="mt-4 text-sm text-muted">
              {t('workspaces.wrongAccount', { email: me.user.email })}
            </p>
            <form action={switchAccountAction} className="mt-4">
              <Button type="submit" variant="secondary">
                {t('workspaces.switchAccount')}
              </Button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
