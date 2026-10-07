// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { redirect } from 'next/navigation';
import { agencyAccess } from '@/lib/auth/page-access';

/** Admins and leads open Members first; recruiters, who have no members page, open Defaults. */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  redirect(`/a/${agencySlug}/settings/${access.role === 'recruiter' ? 'defaults' : 'members'}`);
}
