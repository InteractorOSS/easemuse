// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PortalFrame } from '@/components/portal/portal-frame';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Candidate portal (ADR-003): its own route group, session cookie and API prefix. */
export default async function PortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  return <PortalFrame slug={agencySlug}>{children}</PortalFrame>;
}
