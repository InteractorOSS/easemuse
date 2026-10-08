// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Local values live in the repo-root `.env.local` (git-ignored), not in apps/web.
loadEnvConfig(path.resolve(__dirname, '../..'));

const nextConfig: NextConfig = {
  // The container image sets NEXT_OUTPUT=standalone: a traced, minimal server (`server.js`) instead
  // of `next start` with the whole node_modules. Local `pnpm start` and E2E keep the default.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: path.resolve(__dirname, '../..') }
    : {}),
  transpilePackages: ['@easemuse/core', '@easemuse/tokens'],
  serverExternalPackages: ['pg', '@prisma/client', '@prisma/adapter-pg'],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
