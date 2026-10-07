// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { redirect } from 'next/navigation';

/** Settings has one section for now (members); agency defaults arrive with T-13-04. */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  redirect(`/a/${agencySlug}/settings/members`);
}
