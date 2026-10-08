// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { redirect } from 'next/navigation';
import { soleDestination } from '@/components/home/destination';
import { Landing } from '@/components/home/landing';
import { WorkspaceChooser } from '@/components/home/workspace-chooser';
import { auth, signIn, signOut } from '@/lib/auth';
import { ApiError } from '@/lib/http/errors';
import { getMe, type Me } from '@/server/tenancy/me';

async function signInAction() {
  'use server';
  await signIn('interactor', { redirectTo: '/' });
}

async function signOutAction() {
  'use server';
  await signOut({ redirectTo: '/' });
}

/** Ends this session and goes straight back to Interactor's account picker. */
async function switchAccountAction() {
  'use server';
  await signOut({ redirect: false });
  await signIn('interactor', { redirectTo: '/' }, { prompt: 'select_account' });
}

/** The signed-in user's workspaces, or null when the session points at no user. */
async function loadMe(userId: string | undefined): Promise<Me | null> {
  if (!userId) return null;
  try {
    return await getMe(userId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Entry point for agency users and platform administrators. Signed out: the public landing page.
 * Signed in: straight to the only place they can work, otherwise a chooser (or how to get invited).
 * Portal users (hiring managers, candidates) use their own invitation links.
 */
export default async function HomePage() {
  const me = await loadMe((await auth())?.user?.id);
  if (!me) return <Landing signInAction={signInAction} />;

  const destination = soleDestination(me);
  if (destination) redirect(destination);

  return (
    <WorkspaceChooser
      me={me}
      signOutAction={signOutAction}
      switchAccountAction={switchAccountAction}
    />
  );
}
