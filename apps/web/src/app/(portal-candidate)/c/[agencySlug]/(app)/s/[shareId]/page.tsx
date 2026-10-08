// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ShareView } from '@/components/portal/share-view';

export default async function SharePage({
  params,
}: {
  params: Promise<{ agencySlug: string; shareId: string }>;
}) {
  const { agencySlug, shareId } = await params;
  if (!z.guid().safeParse(shareId).success) notFound();
  return <ShareView slug={agencySlug} prefix="c" shareId={shareId} />;
}
