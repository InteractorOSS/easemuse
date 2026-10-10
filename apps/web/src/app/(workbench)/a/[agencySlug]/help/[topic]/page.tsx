// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { HelpArticle } from '@/components/help/help-article';
import { isHelpTopic } from '@/lib/help/topics';

export default async function HelpTopicPage({
  params,
}: {
  params: Promise<{ agencySlug: string; topic: string }>;
}) {
  const { agencySlug, topic } = await params;
  if (!isHelpTopic('recruiter', topic)) notFound();
  return <HelpArticle audience="recruiter" agencySlug={agencySlug} topic={topic} />;
}
