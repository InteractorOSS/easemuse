# Copyright (c) 2026 Team of Wakers
# SPDX-License-Identifier: MIT
#
# Images (build-prompt §8): stages deps -> builder -> migrate -> runner, plus the worker.
#   docker buildx bake            # web, worker and migrate for linux/amd64 (docker-bake.hcl)
#   --target runner   web: Next.js standalone server on :3000
#   --target worker   BullMQ worker with Chromium at /usr/bin/chromium (PDF rendering, ADR-011)
#   --target migrate  `prisma migrate deploy` as the table owner (DATABASE_ADMIN_URL)
# No secrets are baked in: every runtime value comes from the environment.

ARG NODE_IMAGE=node:24-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /repo

# ---- deps: full workspace install, cached on the manifests and the lockfile only
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/tokens/package.json packages/tokens/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- builder: Prisma client, Next.js standalone build, worker bundle, production node_modules
FROM deps AS builder
COPY . .
ENV NODE_ENV=production NEXT_OUTPUT=standalone SKIP_DB_STARTUP_CHECK=true
RUN pnpm --filter @easemuse/web run db:generate \
 && pnpm --filter @easemuse/web run build \
 && pnpm --filter @easemuse/web run build:worker
# Production-only dependencies for the worker, cut down to the packages its bundle loads.
# `prisma generate` writes the client next to the deployed @prisma/client (its store path
# differs from the dev install, so it cannot be copied).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @easemuse/web deploy --prod --legacy /deploy \
 && cp -r apps/web/prisma /deploy/prisma \
 && cd /deploy && /repo/apps/web/node_modules/.bin/prisma generate --schema prisma/schema.prisma \
 && cp -r /repo/apps/web/dist /deploy/dist \
 && cd /repo/apps/web && node scripts/pack-worker.mjs /deploy /worker \
 && cp /deploy/dist/worker.mjs.map /worker/dist/

# ---- migrate: Prisma CLI, schema, migrations and config only
FROM ${NODE_IMAGE} AS migrate
# libssl first: Prisma picks its schema engine by the OpenSSL it finds (slim ships none).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --no-save --no-audit --no-fund prisma@7.10.0 && npm cache clean --force
COPY --from=builder /repo/apps/web/prisma ./prisma
COPY --from=builder /repo/apps/web/prisma.config.ts ./prisma.config.ts
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---- runner: the web app
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 PROCESS_ROLE=web
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ---- worker: background jobs and PDF rendering
FROM ${NODE_IMAGE} AS worker
# Debian's chromium lands at /usr/bin/chromium (CHROMIUM_PATH). Noto CJK so Korean resumes render.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-cjk fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PROCESS_ROLE=worker CHROMIUM_PATH=/usr/bin/chromium
COPY --from=builder --chown=node:node /worker ./
USER node
CMD ["node", "--enable-source-maps", "dist/worker.mjs"]
