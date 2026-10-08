// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { SiteHeader } from './site-header';

const STEPS = [
  'intake',
  'sourcing',
  'matching',
  'assessment',
  'outreach',
  'submission',
  'interview',
  'hiring',
] as const;

const PRINCIPLES = ['decide', 'onRequest', 'drafts', 'score'] as const;

/**
 * Public home page for signed-out visitors: what EaseMuse is (brief §1), the end-to-end process
 * (§2) and the AI design principles (§1.1), with sign-in as the one action.
 */
export async function Landing({ signInAction }: { signInAction: () => Promise<void> }) {
  const t = await getTranslations('home');
  const signIn = (
    <form action={signInAction}>
      <Button type="submit">{t('signIn')}</Button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader appName={t('title')}>{signIn}</SiteHeader>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-20">
          <p className="text-sm font-medium text-primary-strong">{t('landing.eyebrow')}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance">
            {t('landing.headline')}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">{t('landing.lead')}</p>
          <div className="mt-8">{signIn}</div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-xl font-semibold">{t('landing.processTitle')}</h2>
            <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STEPS.map((step, index) => (
                <li
                  key={step}
                  className="rounded-lg border border-border bg-background px-4 py-3 text-sm"
                >
                  <span className="block text-xs text-muted">{index + 1}</span>
                  <span className="font-medium">{t(`landing.steps.${step}`)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-xl font-semibold">{t('landing.principlesTitle')}</h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2">
            {PRINCIPLES.map((key) => (
              <li key={key}>
                <h3 className="font-medium">{t(`landing.principles.${key}.title`)}</h3>
                <p className="mt-1 text-muted">{t(`landing.principles.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-sm text-muted sm:flex-row sm:justify-between">
          <span>{t('landing.portalNote')}</span>
          <Link href="/admin" className="underline">
            {t('landing.adminLink')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
