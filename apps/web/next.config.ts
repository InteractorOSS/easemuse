// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Local values live in the repo-root `.env.local` (git-ignored), not in apps/web.
loadEnvConfig(path.resolve(__dirname, '../..'));

const nextConfig: NextConfig = {
  transpilePackages: ['@easemuse/core', '@easemuse/tokens'],
  serverExternalPackages: ['pg', '@prisma/client', '@prisma/adapter-pg'],
  poweredByHeader: false,
};

export default nextConfig;
