# Build prompt: easemuse (same stack as Interactor product-manager)

Paste everything below the line into Claude Code, opened in this folder.

**Updated 2026-10-06** to match the accepted plan in `docs/planning/` (ADR-001 to ADR-017). Where this prompt and the planning documents differ, the planning documents win.

---

Build **easemuse**, the AI-Assisted Recruiter Workbench, owned and maintained by **Team of Wakers**. Use the same stack, database setup and Interactor platform integrations as Interactor's product-manager app (`InteractorOSS/product-manager`), except where this prompt says otherwise.

**What to build** comes from, in order of authority:
1. `./init.docx`, the product brief (Korean; read it with `pandoc init.docx -t gfm --wrap=none`). This is the source of truth (see `CLAUDE.md`, "Source of Truth").
2. The product-owner decisions in `docs/discovery/open-questions.md` (decisions log and change record). These override the brief: multi-tenant SaaS for recruiting agencies; hiring manager and candidate portals; in-app email; `/admin` for platform administrators; U.S. first.
3. `docs/discovery/` (requirements, user stories) and `docs/planning/` (architecture, schema draft, API contracts, ADRs, tasks, risks).

**How to build it** is fixed by this prompt and the ADRs. `CLAUDE.md` already lists this stack: no Express, no npm, no Passport. Do not include an enterprise-edition (`ee/`) layer.

**Non-negotiable product rules** (brief §1.1):
- The recruiter makes every decision.
- AI runs only when a user asks.
- Every AI output is a draft until a recruiter approves it.
- The match score sets review order only and never filters anyone out.
- Resume facts are never changed.

## 1. Monorepo

- pnpm 10.18 workspaces (`packageManager: "pnpm@10.18.0"`) plus Turborepo 2.x.
  `pnpm-workspace.yaml` covers `apps/*` and `packages/*`. Set `.npmrc` to `node-linker=hoisted`
  and add a root `preinstall: npx only-allow pnpm`.
- The root `package.json` scripts are thin proxies (`pnpm --filter web run <x>`), so
  `pnpm dev`, `pnpm build`, `pnpm test` and so on work from the root.
- Node 24 (`.nvmrc` = `24`, `engines.node >=24`). TypeScript 6 in strict mode, with
  `module: esnext` and `moduleResolution: bundler`. Packages use `"type": "module"`. Run
  scripts with `tsx`.

```
apps/
  web/        Next.js app: UI + API route handlers + BullMQ worker + Prisma
packages/
  core/       @easemuse/core: shared zod schemas (forms, API and AI structured outputs),
              domain types, API client and TanStack Query hooks. Must not import next/* or expo/*.
  tokens/     @easemuse/tokens: design tokens that generate web CSS variables (and a native theme later)
```

There is no `apps/native` in releases 1–3 (ADR-017). Keep `packages/core` free of web-only imports so a mobile app stays possible.

## 2. Web app (`apps/web`)

- **Framework:** Next.js 16 with the App Router and React 19.2.
- **Route groups** under `src/app` (architecture §4):

  | Group | URL | Who |
  |---|---|---|
  | `(public)`, `(auth)` | `/`, `/sign-in`, magic-link landing, unsubscribe | Anyone |
  | `(workbench)` | `/a/[agencySlug]/…` | Recruiters, leads, agency admins (agency settings live here, not under `/admin`) |
  | `(portal-hm)` | `/h/[agencySlug]/…` | Hiring managers (release 2) |
  | `(portal-candidate)` | `/c/[agencySlug]/…` | Candidates (release 2) |
  | `(admin)` | `/admin/…` | Team of Wakers platform administrators |

- **API:**
  - Agency users: `src/app/api/v1/agencies/[agencyId]/…`. `agencyId` accepts the id or slug; non-members get 404.
  - Portals: `api/portal/v1/[agencySlug]/…`.
  - Platform admins: `api/admin/v1/…`.
  - Also `api/public/…` (unsubscribe), `api/webhooks/*` and `api/sse/[channel]`.
  - Every route declares its audience (`agency | portal | admin | public`), and a guard test fails on unclassified routes.
  - Contracts are in `docs/planning/api-contracts.md`.
- **Custom server:** run Next behind a small custom `server.ts` (HTTP server; add the `ws`
  WebSocket upgrade only if a feature needs it). Dev port is 4025.
- **UI:**
  - Tailwind CSS 4 (`@tailwindcss/postcss`, `@tailwindcss/typography`).
  - Radix UI primitives wrapped shadcn-style in `src/components/ui`, built with
    `class-variance-authority`, `tailwind-merge` and `clsx`.
  - `lucide-react` icons, `sonner` toasts.
  - Design language: green primary `#4CD964`, pill-shaped buttons, `rounded-2xl` cards.
  - The recruiter workbench is desktop-first (≥ 1280 px) with responsive read views. **Portals are mobile-first** (360 px minimum).
  - Every AI draft carries a visible "AI draft" badge and an approve/discard bar.
- **Data:** `@tanstack/react-query` v5 (hooks live in `packages/core`).
- **Forms:** `react-hook-form` + `@hookform/resolvers` + `zod` v4. The same zod schemas are used
  on the client, in route handlers and as AI structured-output schemas.
- **i18n:** `next-intl` v4, with complete `messages/en/*.json`, a `ko` skeleton (Korea later, ADR-015), config in `src/i18n/`, and an ESLint rule that blocks literal strings in JSX.
- **Analytics:** `posthog-js` / `posthog-node`. **Never send candidate, client or document content** to analytics. Use ids and event names only.
- **Observability:** `@sentry/nextjs`, OpenTelemetry (`@opentelemetry/sdk-node` with the
  OTLP HTTP exporter), and `pino` logging with redaction of personal data (`@logtail/pino`
  transport when `LOGTAIL_SOURCE_TOKEN` is set). Scrub personal data from Sentry events. PostHog, Sentry and Logtail are sub-processors, so list them in the DPA.

## 3. Database

- **Engine:** PostgreSQL 16.
  - Local and CI: `pgvector/pgvector:pg16`, via an `apps/web/docker-compose.dev.yml`
    together with `redis:7-alpine`. Plain `postgres:16-alpine` lacks the `vector` extension.
  - Production: CloudNativePG (CNPG) with the `postgresql-pgvector:16.4` image. Enable the
    `vector` extension through a migration.
- **ORM:** Prisma 7.8 with the driver adapter: `@prisma/client`, `@prisma/adapter-pg` and
  `pg`. Generator `prisma-client-js`.
  - The schema lives in `apps/web/prisma/schema.prisma`, migrations in
    `apps/web/prisma/migrations`, and the seed in `apps/web/prisma/seed.ts`.
  - **Start from `docs/planning/schema-draft.prisma`** (47 models, validated with Prisma 7.8).
  - Add a `prisma.config.ts` that uses `DATABASE_URL_UNPOOLED || DATABASE_URL`, so
    `migrate deploy` can take its advisory lock even behind a transaction-mode pooler.
- **Single client:** create one Prisma client in `src/lib/db.ts`, built on a `pg.Pool`.
  - Pool settings live in `src/lib/db-pool-config.ts`, with separate `web` and `worker`
    roles. Defaults: pool max 10, statement timeout 60s, idle-in-transaction timeout 60s,
    connection-acquire timeout 30s, transaction maxWait 5s and timeout 10s.
  - Env overrides: `DATABASE_CONNECTION_LIMIT`, `DATABASE_POOL_WEB_MAX`,
    `DATABASE_POOL_WORKER_MAX`, `DATABASE_POOL_LOCK_MAX`.
  - Use a small separate pool (max 4) for advisory locks.
- **Conventions:**
  - Primary keys: `id String @id @default(uuid()) @db.Uuid`. Foreign keys are also `@db.Uuid`.
  - Prisma models are PascalCase and fields are camelCase. Tables get a snake_case plural
    `@@map("...")`, and enums also get `@@map` to snake_case. RLS policy SQL uses those mapped names.
  - Every model has `createdAt DateTime @default(now())`, and mutable rows also have
    `updatedAt DateTime @updatedAt`. History tables are append-only (ADR-016).
  - Every agency-owned table has `agencyId`, first in its composite indexes
    (`@@index([agencyId, ...])`).
  - Put `///` doc comments on non-obvious models and fields.
  - Embedding columns are `Unsupported("vector(1024)")` in `ProfileEmbedding` and are read and written with raw SQL.
- **Multi-tenancy (ADR-001):** this departs from product-manager. Use **row-level security on top of application scoping**.
  - The tenant is the **Agency**. Tenant-owned rows carry `agencyId`.
  - Every agency table has `ENABLE` + `FORCE ROW LEVEL SECURITY` and an `agency_isolation` policy on `current_setting('app.agency_id', true)`. `Membership` also has a user-scoped policy on `app.user_id`.
  - The web and worker connect as `easemuse_app`, which has no BYPASSRLS and doesn't own the tables. Startup refuses an owner connection.
  - All agency data access goes through `withAgency(agencyId, fn)` in `src/lib/db/`. It runs an interactive transaction with `set_config(..., true)`. Lint bans the base client outside `lib/db`.
  - Platform tables (`Agency`, `User`, `JobRun`, `PlatformAdminInvite`, `PlatformAuditLog`) are not under RLS and are reached only through membership checks or `authorizePlatformAdmin`.
  - Guard tests:
    - every agency table has RLS
    - every route has an isolation test (agency A acting on B's ids gets 404 and zero rows)
    - background jobs fail closed without an agency context
  - The local `Agency.id` is **not** the Account Server org. Keep the Account Server org claim separately on the session (§5).
- **Core tables** (build these first, then the domain tables in the schema draft):
  - `User`: `interactorSubject` (Account Server `sub`, unique), `email`, `name`, `platformRole` (`owner | admin | support`, null for non-admins).
  - `Agency`: `slug` (unique), `status` (`trial | active | suspended | closed`), `region`, settings, branding, AI budget.
  - `Membership`: user ↔ agency with role `admin | lead | recruiter`.
  - `MemberInvite`, `PlatformAdminInvite`, `SupportAccessGrant`.
  - `ActivityLog` (per agency, append-only) and `PlatformAuditLog` (for `/admin` actions).
  - `JobRun`: BullMQ job history with idempotency keys.
  - `WebhookEvent`: idempotency ledger for inbound webhooks (release 2), unique on provider + event id.
  - `FileObject` + `FileBlob`: original uploads stored in **our own Postgres** (ADR-010). `Task` covers reminders and "My tasks today".
- **Realtime:** Postgres `LISTEN/NOTIFY`. The worker (`src/worker/pg-listen.ts`) listens and
  fans out to SSE clients at `/api/sse/[channel]`. Channels are agency-scoped, and the SSE route checks membership.
- **Commands** (in `apps/web/package.json`):
  - `db:migrate` = `prisma migrate dev`
  - `db:migrate:prod` = `prisma migrate deploy`
  - `db:generate` = `prisma generate`
  - `db:studio` = `prisma studio`
  - `db:seed` = `tsx --env-file=../../.env.local prisma/seed.ts`
- **Migrations:** production runs them as a separate `migrate` Docker target and a Helm
  pre-upgrade Job, never at app start. RLS policies, roles and grants live in raw-SQL
  migrations. Add a CI check that `schema.prisma` and the migrations have not drifted.
- **Backups:** a CNPG `ScheduledBackup` to an S3-compatible bucket, with 30-day retention.
  product-manager still uses the in-tree `barmanObjectStore` and plans to move off it before
  CNPG 1.31. Start easemuse on the Barman Cloud plugin instead. Backups hold candidate files
  (`FileBlob`), so encrypt them.
- **Tests and the database:** unit tests run with no database. `src/test/setup.ts` mocks
  `next-auth` and `@/lib/auth`, and `src/test/no-real-sockets.ts` blocks network access.
  Tests that need a real database go in `vitest.real-smoke.config.ts` and run in a CI job
  against `pgvector/pgvector:pg16`. The RLS and isolation suites run here.

## 4. Background jobs, files, email, AI

- **Jobs:** `bullmq` 5 + `ioredis`. A separate worker process at `src/worker/index.ts` with
  its own `tsconfig.worker.json`, run as its own deployment.
  - Queues: `ai`, `documents`, `messaging`, `indexing`, `maintenance`.
  - Every job payload carries `agencyId` and `requestedBy`, and the runner wraps the handler in `withAgency`.
  - The `ai` queue has a per-agency limiter.
- **Files (ADR-010, ADR-011):**
  - Uploaded resumes and JDs are stored in Postgres (`FileBlob`, under RLS, 10 MB limit).
  - Text is extracted in the worker: a PDF text layer and a DOCX converter. Scans fall back to sending the PDF to Claude.
  - Generated PDFs/DOCX and agency logos go to S3-compatible storage via `@aws-sdk/client-s3` (`src/lib/storage/s3.ts`, `S3_*` env, keys `easemuse/<agencyId>/…`).
  - PDFs are rendered by headless Chromium from print routes.
  - **Do not use Interactor userdb.**
- **Email (ADR-009):** an `OutboxMessage` table and a `messaging.send` job behind a `Transport` interface.
  - Transports: `dev-capture` (default outside production, never delivers), `log-only`, and `smtp` (nodemailer, `src/lib/email/transport.ts`). A Resend transport (`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`) is optional.
  - Agency Gmail/Microsoft 365 mailboxes come later, through Interactor credentials.
  - Outreach email is sent only when the recruiter clicks Send on that one message.
  - Every outreach email has an unsubscribe link and is checked against suppressions.
- **AI (required; ADR-004, ADR-005, ADR-006, ADR-007):**
  - `@anthropic-ai/sdk` behind one gateway (`src/server/ai`). It is the only module allowed to import the SDK.
  - **Routing table** per purpose: `claude-sonnet-5-5` for high-volume extraction and structuring (intake questions, search criteria, profile structuring, call questions, notes → qualification, feedback structuring, fact-check verifier); `claude-opus-5-5` for JD structuring, benchmark, success profile, match analysis, outreach, tailored resume, submission report and pattern summary.
  - Set `output_config.effort` explicitly per purpose.
  - **Structured outputs** via `output_config.format` / `messages.parse()` with zod. **Do not use forced `tool_choice`**; these models reject it.
  - Always check `stop_reason` and handle refusals; enable the server-side fallback (`fallbacks: "default"`).
  - Prompts live in `src/server/ai/prompts/*.ts`, each with a schema and a `PROMPT_VERSION`.
  - Every call writes `LlmCall` (tokens, cost) and `AiGeneration` (provenance). A per-agency monthly budget gate returns 402 when exceeded.
  - Outputs are `ArtifactVersion` drafts. Only approved versions are read downstream. Generated documents go through the fact check.
  - Match scores: the model scores each criterion with evidence, and **code** computes the weighted overall score.
  - Benchmarking uses the `web_search_20260209` server tool (release 3).
  - Embeddings use Voyage AI `voyage-3-large` (1024 dims, `VOYAGE_API_KEY`, release 3).

## 5. Interactor platform services

All Interactor code lives under `apps/web/src/lib/interactor/`, with a `README.md` that
describes each service (ADR-014).

**Shared rules:**
- `service-urls.ts` declares every base URL once. Nothing else hard-codes a host.
- `egress-probe.ts` checks that each host is reachable, so a health endpoint can report it.
- Every call sends `Authorization: Bearer <JWT>`.
  - For user actions, use the user's token.
  - For server jobs, use a service token.
- The **agency** (tenant) comes from the user's local `Membership`, checked per request. It never comes from a request body or from the token's `org` claim, which identifies the Interactor org of the app, not a customer agency.
- Local dev hits the services on ports 4001–4007 (or the staging hosts).

| Service | Prod host | Use in easemuse | When | Env vars | Client file |
|---|---|---|---|---|---|
| Account Server (auth), **required** | `auth.interactor.com` (dev :4001) | Sign-in for agency users and platform admins (OIDC SSO, optional email/password), JWKS, service tokens | Release 1 | `ACCOUNT_SERVER_URL`, `INTERACTOR_OAUTH_ISSUER`, `INTERACTOR_AUTH_CLIENT_ID`, `INTERACTOR_AUTH_CLIENT_SECRET`, `INTERACTOR_CLIENT_ID`, `INTERACTOR_EXPECTED_APP_NAME`, `INTERACTOR_EXPECTED_AUDIENCE`, `INTERACTOR_AUDIENCE_CHECK`, `AUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_ALLOW_PASSWORD_LOGIN` | `interactor/auth/{sso-provider,service-token,jwks,audience,auth-client-guard}.ts` |
| Billing Server | `billing.interactor.com` | Plans, seats, usage metering, subscription webhooks. No Stripe. Release 1 keeps only the local `LlmCall` ledger and budget gate | Release 2 | `BILLING_SERVER_URL`, `BILLING_WEBHOOK_SECRET`, `BILLING_REPORTING_DISABLED` | `interactor/billing/client.ts`, `lib/billing/*`, `app/api/webhooks/billing-subscription/route.ts` |
| Core: credentials | `core.interactor.com` | OAuth vault for agency mailboxes (Gmail / Microsoft 365) used to send outreach and sync replies. easemuse stores only the `credentialId` | Release 2 | `INTERACTOR_CORE_URL` | `lib/integrations/interactor-client.ts` |
| Core: SKB | core proxy `/api/v1/service-knowledge-base/*` | Discover the mailbox/calendar integrations available for credentials | Release 2–3 | `INTERACTOR_CORE_URL` | `interactor/skb/client.ts` |
| Core: webhooks | inbound to easemuse | `credential.expired` / `credential.revoked` and mail events at `app/api/webhooks/interactor/route.ts`. Verify the HMAC signature and dedupe through `WebhookEvent` | Release 2 | `INTERACTOR_WEBHOOK_SECRET`, `INTERACTOR_ORG_CALLBACK_SECRET` | `interactor/webhooks/hmac.ts` |
| Core: agents | — | **Not used** (ADR-004); maybe later for a conversational assistant over client history | — | — | — |
| Core: workflows | — | **Not used**; multi-step AI runs as app jobs (ADR-004) | — | — | — |
| UKB | — | **Not used** in releases 1–2; evaluate in release 3 only with per-agency scoping guaranteed | — | — | — |
| userdb | — | **Not used** (product-owner decision Q-34); files stay in our Postgres | — | — | — |

There is no Interactor npm SDK: every service above is called over REST with `fetch`.

### Auth details (ADR-002)

- **Library:** Auth.js / `next-auth` v5 (beta) with JWT sessions (`src/lib/auth.ts`,
  `src/lib/auth-providers.ts`). Use `jose` to verify tokens. There are no local passwords
  for Interactor users.
- **OIDC provider:** a custom provider with `id: "interactor"` and `type: "oidc"`.
  - `issuer` is `ACCOUNT_SERVER_URL`.
  - `authorization.params` are `{ scope: "openid profile email", prompt: "select_account" }`.
  - `profile.sub` becomes the user id.
  - The client id and secret come from `.env.local` and are never committed.
- **Email/password provider (optional):** an Auth.js Credentials provider, registered only
  when `AUTH_ALLOW_PASSWORD_LOGIN` is set. By default sign-in is SSO only.
  - It POSTs to `${ACCOUNT_SERVER_URL}/api/v1/admin/login` and receives an `access_token`.
  - It verifies that token against `${ACCOUNT_SERVER_URL}/.well-known/jwks.json`, with
    issuer and audience checks controlled by `INTERACTOR_EXPECTED_AUDIENCE` and
    `INTERACTOR_AUDIENCE_CHECK`.
  - It then returns `{ id: sub, email, name }`.
- **Portal users (release 2):** hiring managers and candidates **do not** get Interactor accounts.
  - They sign in with an app-issued magic link: an Auth.js provider like product-manager's `techSetupInviteProvider`, with a single-use hashed token.
  - Redemption goes through `api/portal/v1/[agencySlug]/magic-link/redeem`, and the session is separate (`em_portal` cookie).
- **MFA:** required for agency admins, recruiters and platform admins. Check the Account Server `amr`/`acr` claims.
- **Discovery and logout:** use `/.well-known/openid-configuration`, and sign the user out
  through the OIDC end-session endpoint.
- **Routes:** `app/api/auth/[...nextauth]/route.ts` and `app/auth/sso/route.ts`.
- **Sign-in callback** (`src/lib/auth/resolve-sign-in-user.ts`, `src/lib/auth-callbacks.ts`):
  - Find `User` by `interactorSubject`, falling back to email, and create it if missing.
  - Store the Account Server org slug on the JWT and session as `interactorOrg`. This is
    kept separate from `Agency.id`.
  - **Do not auto-create memberships.** Users join agencies through `MemberInvite`, and platform admins through `PlatformAdminInvite`.
- **Service tokens:** use the OAuth2 `client_credentials` grant at
  `${ACCOUNT_SERVER_URL}/oauth/token` with `INTERACTOR_AUTH_CLIENT_ID` and
  `INTERACTOR_AUTH_CLIENT_SECRET`. Tokens last about 15 minutes. Cache them in memory and
  refresh shortly before they expire (`service-token.ts`, `getServiceToken()`).
- **Client guard:** `auth-client-guard.ts` checks that incoming tokens were issued to this
  app (`INTERACTOR_CLIENT_ID`, `INTERACTOR_EXPECTED_APP_NAME`).
- **Route protection:**
  - Next middleware protects `(workbench)`, `(admin)` and the portal groups.
  - API handlers call `authorizeAgency(req, {roles})`, `authorizePortal(req, {audience})` or `authorizePlatformAdmin(req, {role})` (ADR-012).
  - Other agencies' resources return 404.

## 6. Mobile

No mobile app in releases 1–3 (ADR-017). If added later: Expo SDK 56, React Native 0.86,
`expo-router`, reusing `@easemuse/core` and `@easemuse/tokens`.

## 7. Testing and quality

- **Unit and component tests:** Vitest 4 with Testing Library and jsdom. Put tests next to
  the code as `*.test.ts(x)`, and use `*.guard.test.ts` for architecture guards.
- **E2E:** Playwright with `@axe-core/playwright` accessibility checks (WCAG 2.1 AA).
- **AI evaluation:** `apps/web/evals/`, built on the data in `eval-data/`:
  - 30 public JDs, not in git
  - 100 synthetic resumes with answer keys
  - 5 bias pairs

  Re-run the eval before any prompt or model change (NFR-AI05).
- **Guards:**
  - RLS on every agency table
  - route classification
  - isolation per route and per job
  - approved-only artifact reads
  - portal routes never importing recruiter query modules
  - permission matrix (role × endpoint)
- **Lint and format:**
  - ESLint 9 flat config with `eslint-config-next`.
  - Prettier 3 with `prettier-plugin-tailwindcss`.
- **Commits:** commitlint with `@commitlint/config-conventional` and an explicit scope list.
  Every AI-assisted commit ends with `Generated with AI assistance` and
  `Co-Authored-By: Interactor Build <peter@interactor.com>` (never a Claude co-author line; see `CLAUDE.md`).
- **CI guards:** use `madge` for import cycles (with a baseline file) and gitleaks for
  secrets, and add a license-header check.
- **License header** on every source file (MIT, see `LICENSE`):
  ```
  // Copyright (c) 2026 Team of Wakers
  // SPDX-License-Identifier: MIT
  ```

## 8. Infrastructure and deploy

The planning documents leave infrastructure out of scope; this section follows product-manager.

- **Dockerfile:** multi-stage on `node:24-slim`, with stages `deps → builder → migrate →
  runner`. `docker-bake.hcl` has the targets `web` and `migrate`. The worker image needs
  Chromium for PDF rendering.
- **Kubernetes:** Oracle OKE with a Helm chart at `ops/oke/helm/easemuse`. The chart includes:
  - web and worker Deployments, with an HPA and PDB
  - the migrate Job
  - a CNPG `Cluster` (pgvector image, scheduled backups)
  - Redis
  - an Ingress with cert-manager TLS
- **Terraform:** in `ops/terraform/{staging,prod}`.
- **GitHub Actions:**
  - `ci.yml`: lint, typecheck, unit tests, E2E, guards, RLS/isolation smoke.
  - `docker-image.yml`.
  - `promote-staging.yml`: deploys to staging automatically on main.
  - `deploy-prod-oke.yml`: manual, gated by the `production` environment.
  - `release.yml`.
- **Domains:** to be confirmed with Team of Wakers before provisioning (product-manager uses
  `*.interactor.com`; easemuse may not).
- **Env files:** `.env.example` lists every env var named in this prompt, with comments and
  no values. Local secrets go in **`.env.local` at the repository root** (git-ignored; it
  already holds the Interactor client id and secret). Load it explicitly: `loadEnvConfig`
  from `@next/env` pointed at the repo root in `next.config.ts`, and
  `tsx --env-file=../../.env.local` for the worker and scripts.

## 9. How to proceed

Discovery and planning are complete (`docs/discovery/`, `docs/planning/`, all ADRs accepted).

1. Re-read `init.docx` and `docs/planning/README.md` before each sprint. Cite the brief section a feature implements in PRs and tests, and flag any deviation instead of diverging.
2. Follow the sprint plan in `docs/planning/tasks.md`. Sprint 1 covers:
   - scaffold (T-F-01 to T-F-03)
   - env validation (T-F-04)
   - database, Prisma and the RLS spike (T-F-05 to T-F-10)
   - HTTP helpers (T-F-14)

   The RLS + pooled-connection spike (T-F-07) decides whether ADR-001 works as written. Report its result before building on it.
3. Build features one vertical slice at a time: schema, API, core hooks, UI, tests, isolation test, and eval cases for any AI purpose.
4. After each step run `pnpm lint`, `pnpm typecheck` and `pnpm test`. Do not move on until
   they pass.
5. Use `/handle-change` for any scope change and record it in `docs/discovery/open-questions.md`.
