// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { HelpIndex } from '@/components/help/help-index';

/** Help for recruiters and agency admins. Access is the workbench layout's membership check. */
export default async function HelpPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  return <HelpIndex audience="recruiter" agencySlug={agencySlug} />;
}
