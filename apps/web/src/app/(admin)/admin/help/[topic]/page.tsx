// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { HelpArticle } from '@/components/help/help-article';
import { isHelpTopic } from '@/lib/help/topics';

export default async function AdminHelpTopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  if (!isHelpTopic('admin', topic)) notFound();
  return <HelpArticle audience="admin" agencySlug={null} topic={topic} />;
}
