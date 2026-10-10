// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { HelpIndex } from '@/components/help/help-index';

/** Help for platform administrators. Access is the admin layout's platform-role check. */
export default function AdminHelpPage() {
  return <HelpIndex audience="admin" agencySlug={null} />;
}
