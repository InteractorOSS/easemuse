# Handoff for a new working session

Read this first, then `docs/planning/tasks.md` (the task list and its progress notes), `docs/planning/implementation-notes.md` (choices already decided) and the ADRs in `docs/planning/decisions/`. The brief is `init.docx` (`pandoc init.docx -t gfm --wrap=none`).

## Where things stand (2026-10-07)

- **Release 1** is built, including the browser happy path (`pnpm test:e2e`).
- **Release 2** is partly built: the portals (E14/E15), feedback, offer reminders and the admin Anthropic-key setting are done. Open items are in the Release 2 tables of `tasks.md`.
- **Release 3** is not started. It is broken down in `tasks.md`.
- Branch `feature/foundation-scaffold`, nothing pushed. Uncommitted and not ours: `LICENSE`, `README.md`, `scripts/setup/*`, `AGENTS.md`, `eval-data/` (leave them alone; do not commit `eval-data/`, its job descriptions are third-party text).

## The rules that matter

- The brief's principles (section 1.1) are never weakened: the recruiter decides, AI runs only on a user action, AI output is a draft until approved, scores are reference only, resume facts are never altered. Check each feature against the brief section it implements and say so when you deviate.
- The product owner has said: do not ask, keep going; you make the decisions the brief leaves open, and record them in `implementation-notes.md`.
- Commits: conventional commits, end with `Generated with AI assistance`, a blank line and `Co-Authored-By: Interactor Build <peter@interactor.com>` (never Claude). Commit only after `pnpm check` passes, chained with `&&`. Do not push.
- Every source file starts with the two-line license header (`pnpm lint:headers`). No literal strings in JSX (use `messages/en/*.json`; add a namespace to `src/i18n/messages.ts` and an empty `messages/ko/<ns>.json`).
- Never read `.env.local`; it holds secrets. To run something that needs the keys, `set -a; . ../../.env.local; set +a` in the same shell command.

## How to work here

- `pnpm check` = format, license headers, import cycles, typecheck, lint, all tests, build. It must pass before every commit. `pnpm format` fixes formatting. Prettier reflows lines, so patch code with small, exact edits and re-read after a failed replace.
- Run one test file: `cd apps/web && npx vitest run <path>`. Database tests (`*.db.test.ts`) need the local Postgres and Redis; `pnpm db:setup` creates the databases and the roles `easemuse_app` and `easemuse_datarights`.
- New migration: add `apps/web/prisma/migrations/<timestamp>_<name>/migration.sql` and the model in `schema.prisma`, then `prisma migrate deploy` for the dev database (`DATABASE_URL=postgresql://$(whoami)@localhost:5432/easemuse_dev`) and `prisma generate`. The test database migrates itself when tests start. Every table with an `agencyId` needs RLS (`ENABLE`, `FORCE`, the `agency_isolation` policy); a guard test fails without it.
- Tenant data is reached only through `withAgency(agencyId, fn, {userId})` (never the raw client). Services take `(tx, actor, ...)`. Audit tables are append-only for the app role; only the data-rights job writes to them.
- A new API route needs: the `// route-audience:` header, `authorizeAgency` (or `authorizePlatformAdmin`/`authorizePortal`), a mock and an entry in `src/app/api/permission-matrix.test.ts`, and for public routes a `rateLimit(`. Portal code must not import recruiter-side modules (guard test).
- AI work goes through the gateway (`src/server/ai`): a prompt module in `src/server/ai/prompts/` registered in `index.ts`, a purpose in `purposes.ts`, and a content schema for the artifact kind in `packages/core/src/artifacts/`. Names and contact details never go to a model; use the redaction helpers. Only approved artifact content feeds later steps (`readApproved`; a guard test enforces it).
- Tests: Vitest (node and jsdom), `renderApp` and `stubApi` for components, `expectNoA11yViolations` (axe) for screens, fakes for the model and the PDF printer. Add the new routes to the isolation test (`src/server/isolation.features.db.test.ts`) when they take a resource id.

## Tools you can use

- `pnpm test:e2e` runs the browser walk-through of the release 1 loop in its own database, Redis database and ports (see `playwright.config.ts`). It needs the local Postgres and Redis and the Playwright Chromium (`pnpm exec playwright install chromium`).

- `pnpm eval -- --suite <name> --limit N --max-cost USD` runs the prompts against `eval-data/` with the real model (needs credit on the Anthropic key; see `apps/web/evals/README.md`). Results so far: A7 90% fully correct on 20 resumes with no invented numbers, A10 levels 82% exact and 99% within one step with correct ranking, bias spread at most 4 points. A1 and stability are not run yet.
- The Anthropic key and the Voyage key can be entered by a platform owner in `/admin/settings` (stored encrypted); `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are only fallbacks. The benchmark's web search is off unless `WEB_SEARCH=on`. `pnpm eval -- --suite pool-similar` and `--suite benchmark` exist but have not been run (no credit on the Anthropic key, no Voyage key).
- Real-browser check of the print pages: see the header of `src/server/documents/render/live-render.db.test.ts`.
- `DATABASE_URL_DATARIGHTS` must be set on the worker for candidate deletion.

## Known gaps

Pool intelligence and the benchmark (session D) are built and tested against fakes; no live Voyage or web search call has been made.

SMTP and the connected mailbox are built but not run against real services (see `mail-setup.md`); Korean translations (skeleton only); the Billing Server client has not run against the real server (no credentials, see `docs/planning/billing.md`); the legal documents in `docs/legal/` are drafts nobody has reviewed and the penetration test is not done; every drafting prompt except A7 and A10 has only been tested against fakes (no labelled data for them, they need a recruiter's review).
