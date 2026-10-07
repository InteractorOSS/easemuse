// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** How `/api/admin/v1/usage` can group AI usage (US-1604). Shared by the API and the admin UI. */
export const USAGE_GROUPS = ['agency', 'purpose', 'model', 'day'] as const;
export type UsageGroup = (typeof USAGE_GROUPS)[number];
