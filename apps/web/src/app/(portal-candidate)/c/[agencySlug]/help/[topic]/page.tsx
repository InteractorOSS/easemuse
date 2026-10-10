// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { PortalHelp } from '@/components/help/portal-help';

export default async function HelpTopicPage({
  params,
}: {
  params: Promise<{ agencySlug: string; topic: string }>;
}) {
  const { agencySlug, topic } = await params;
  return <PortalHelp prefix="c" slug={agencySlug} topic={topic} />;
}
