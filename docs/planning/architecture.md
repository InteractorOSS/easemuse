# Architecture Design Document

| Field            | Value                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**      | EaseMuse AI-Assisted Recruiter Workbench                                                                                                                                          |
| **Version**      | 0.1                                                                                                                                                                               |
| **Last updated** | 2026-10-06                                                                                                                                                                        |
| **Status**       | Draft, for review with ADR-001 to ADR-017                                                                                                                                         |
| **Inputs**       | `init.docx` (source of truth), [discovery](../discovery/README.md), [planning handoff](../discovery/planning-handoff.md), Interactor product-manager codebase (pattern reference) |

---

## 1. Executive summary

EaseMuse, owned and maintained by Team of Wakers, is a multi-tenant SaaS workbench for recruiting agencies. It supports the recruiter through the whole process in brief §2: intake, JD analysis, sourcing, matching, screening, outreach, qualification, resume preparation, submission, interviews, offer and analytics. Hiring managers and candidates take part through portals. AI drafts and organizes on request; the recruiter decides and approves (brief §1.1).

The system is a **modular monolith**: one Next.js 16 application that serves the recruiter workbench, the platform admin section (`/admin`), the two portals and the API, plus a **worker process** built from the same codebase for background jobs. It follows the Interactor product-manager structure (same stack, same conventions) so the team can reuse code and operational knowledge. It deliberately departs from product-manager in one place: **tenant isolation is enforced by the database (Postgres row-level security) as well as by application code** (ADR-001). product-manager's own isolation audit (`docs/security/tenant-isolation-audit.md` there) found eleven cross-tenant leaks under app-only scoping, and candidate data is more sensitive.

---

## 2. Requirements summary

Full detail: [requirements.md](../discovery/requirements.md). Architecturally significant requirements:

| Driver                        | Requirement                                                                        | Architectural response                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Brief §1.1 principles         | AI only on request, output is a draft, recruiter approves, score is reference only | AI gateway with request records; artifact/version/approval model (ADR-006); no AI in state transitions |
| Multi-tenant SaaS             | FR-TEN-01, NFR-S08                                                                 | Agency-scoped rows + RLS + scoped Prisma client (ADR-001)                                              |
| Three audiences               | FR-PLT-02, FR-HMP-04, FR-CDP-01                                                    | Separate route groups and narrow portal APIs (ADR-003, ADR-012)                                        |
| Explainable matching          | Brief §5, FR-MAT-01…04                                                             | Criterion scoring with evidence; score computed in code (ADR-007)                                      |
| No invented facts             | Brief §9.1, FR-AI-06                                                               | Fact-check step on generated documents (ADR-006)                                                       |
| In-app email, no provider yet | FR-MSG-01…05                                                                       | Outbox + transport interface; SMTP and dev-capture first (ADR-009)                                     |
| Performance                   | NFR-P01…05                                                                         | Long AI work in BullMQ jobs; SSE progress; streaming drafts                                            |
| Cost control                  | FR-AI-08, FR-TEN-05, NFR-SC03                                                      | LlmCall ledger, per-agency budget caps, Billing Server metering (ADR-013)                              |
| U.S. first, Korea later       | C2, FR-TEN-08                                                                      | Region field on Agency; no cross-region assumptions; next-intl (ADR-015)                               |

### Constraints

- Stack fixed by the product owner (requirements C5). Infrastructure is out of scope for these documents.
- No automation against LinkedIn (C4). No paid market data.
- `init.docx` is the source of truth (CLAUDE.md). Each module below cites the brief section it implements.

---

## 3. System context

```
                ┌──────────────────────────── Users ────────────────────────────┐
                │ Recruiter · Agency admin · Lead   HM (portal)   Candidate (portal)   Platform admin │
                └──────┬─────────────────────────────┬──────────────┬───────────────────┬────────────┘
                       │ Interactor SSO (OIDC)       │ magic link   │ magic link        │ SSO
                       ▼                             ▼              ▼                   ▼
  ┌──────────────────────────────────────── apps/web (Next.js 16) ─────────────────────────────────────┐
  │  (workbench)/a/[agency]/…   (portal-hm)/h/…   (portal-candidate)/c/…   (admin)/admin/…            │
  │  /api/v1/…  (agency users)  /api/portal/v1/… (portal users)  /api/admin/v1/…  /api/sse/[channel]     │
  │                                                                                                    │
  │  src/server/<module>  ── domain services (intake, sourcing, matching, …) ──┐                       │
  │  src/server/ai        ── AI gateway: prompts, zod schemas, LlmCall ledger  │                       │
  │  src/lib/db           ── agency-scoped Prisma client (sets RLS context)    │                       │
  └──────────────┬───────────────────────────────┬────────────────────────────┼───────────────────────┘
                 │ enqueue (JobRun)              │ pg_notify                   │
                 ▼                               ▼                             ▼
  ┌──────────────────────────┐   ┌─────────────────────────┐   ┌───────────────────────────────────┐
  │ worker (same codebase)   │   │ PostgreSQL 16 + pgvector │   │ Redis (BullMQ queues, SSE fan-out)│
  │ BullMQ jobs, pg-listen   │──▶│ RLS on every agency table│   └───────────────────────────────────┘
  └────────────┬─────────────┘   └─────────────────────────┘
               │
   External:   ├── Anthropic API (Claude; incl. web search tool for benchmarking)
               ├── Interactor Account Server (OIDC, service tokens)
               ├── S3-compatible object store (generated PDFs, logos)
               ├── Interactor Billing Server (usage metering, plans)
               ├── SMTP or dev-capture transport (email); later Gmail/Graph via Interactor credentials
               └── (later) Interactor webhooks (HMAC) for inbound provider events
```

### Architecture style

**Modular monolith + worker**, as in product-manager. Rationale: one deployable for a small team; strong typing across modules; transactions across domain tables (for example, approval + state transition); the same codebase runs web and worker. Modules talk through service functions, not HTTP. Import-cycle checks keep module boundaries honest.

---

## 4. Repository layout

Mirrors product-manager (`apps/web` holds app, API, worker and Prisma).

```
easemuse/
├── apps/web/
│   ├── prisma/schema.prisma, migrations/        # all migrations here (product-manager incident lesson)
│   ├── messages/{en,ko}/*.json                  # next-intl; ESLint blocks literal JSX strings
│   ├── evals/                                   # AI evaluation sets + runners (NFR-AI01–05)
│   └── src/
│       ├── app/
│       │   ├── (auth)/                          # sign-in, magic-link landing
│       │   ├── (workbench)/a/[agencySlug]/…     # recruiter + agency admin UI
│       │   ├── (portal-hm)/h/[agencySlug]/…     # hiring manager portal
│       │   ├── (portal-candidate)/c/[agencySlug]/…
│       │   ├── (admin)/admin/…                 # Team of Wakers platform admin section (/admin)
│       │   └── api/{v1,portal/v1,admin/v1,sse}/…
│       ├── server/                              # domain modules (below); no React imports
│       │   ├── tenancy/ identity/ intake/ sourcing/ matching/ screening/ outreach/
│       │   ├── qualification/ documents/ submission/ interviews/ offers/ analytics/
│       │   ├── knowledge/ portal/ messaging/ tasks/ audit/ billing/
│       │   └── ai/ (gateway, prompts/, schemas/, factcheck/, embeddings/)
│       ├── lib/ (db, auth, http, queue, realtime, storage, email, interactor/)
│       ├── worker/ (index.ts, jobs/)
│       └── components/ (ui/ Radix wrappers, <domain>/ feature components)
├── packages/core/                               # shared zod schemas + types (web now, native later)
└── packages/tokens/                             # design tokens (web CSS vars; native theme later)
```

`packages/core` holds the **zod schemas** shared by forms, API validation and AI structured outputs (one schema per artifact: StructuredJD, CandidateProfile, MatchAnalysis, SubmissionReport, …). That keeps the AI contract, the form and the API in sync.

---

## 5. Component design

### 5.1 Domain modules (traced to the brief)

| Module           | Brief §                 | Responsibility                                                                                                                                                                                                                                                                           | Key FRs                |
| ---------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `tenancy`        | — (SaaS decision)       | Agencies, memberships, roles, settings, branding, region, support grants                                                                                                                                                                                                                 | TEN-01…08              |
| `platform-admin` | — (decision 2026-10-06) | `/admin` for Team of Wakers platform administrators: agencies, suspension, platform admins, usage/budgets, audit log, support access, billing, health, configuration. Reads platform tables and security-definer aggregate views only; agency content only under an active support grant | ADM-01…10              |
| `identity`       | —                       | SSO for agency users and platform administrators; magic links for portal users; actor resolution                                                                                                                                                                                         | PLT-01, HMP-01, CDP-01 |
| `intake`         | §3.1–3.4                | Clients, contacts, positions, JD versions, requirements, intake record, success profile, benchmark                                                                                                                                                                                       | INT-01…12              |
| `sourcing`       | §4.1–4.3                | Candidates, documents, profiles, duplicates, pool search, portfolio, similar candidates                                                                                                                                                                                                  | SRC-01…10              |
| `matching`       | §5.1–5.3                | Matching model weights, match analyses, overrides, dashboard read model                                                                                                                                                                                                                  | MAT-01…08              |
| `screening`      | §6                      | Screening checklist, classification                                                                                                                                                                                                                                                      | SCR-01…03              |
| `outreach`       | §7.1–7.3                | Sequences, touches, drafts, response tracking, do-not-contact                                                                                                                                                                                                                            | OUT-01…07              |
| `qualification`  | §8                      | Call question lists, structured qualification records                                                                                                                                                                                                                                    | QUA-01…04              |
| `documents`      | §9.1–9.2                | Tailored resumes, rendering to DOCX/PDF, candidate approval                                                                                                                                                                                                                              | RES-01…03              |
| `submission`     | §10                     | Submission reports (14 sections), submissions, portal publishing                                                                                                                                                                                                                         | SUB-01…04              |
| `interviews`     | §11                     | Rounds, statuses, structured feedback                                                                                                                                                                                                                                                    | IVW-01…05              |
| `offers`         | §12                     | Offer milestones, outcomes, reminders to start                                                                                                                                                                                                                                           | OFF-01…03              |
| `analytics`      | §13                     | KPI computation from transition history; source performance                                                                                                                                                                                                                              | ANA-01…04              |
| `knowledge`      | §14                     | Client history, pattern reports, AI pattern summary                                                                                                                                                                                                                                      | KNW-01…03              |
| `portal`         | — (decision)            | Read models and actions for HM and candidate portals                                                                                                                                                                                                                                     | HMP-_, CDP-_           |
| `messaging`      | §7.2 (sending)          | Outbox, transports, suppression, templates                                                                                                                                                                                                                                               | MSG-01…06              |
| `tasks`          | §7.2, §11, §12          | Reminders and "My tasks today"                                                                                                                                                                                                                                                           | PLT-04                 |
| `audit`          | §1.1 (records)          | Activity log, transition history, AI provenance export                                                                                                                                                                                                                                   | PLT-03, PLT-07         |
| `billing`        | —                       | LlmCall ledger roll-up, budgets, Billing Server metering                                                                                                                                                                                                                                 | AI-08, TEN-05          |
| `ai`             | §1.1, §15②              | Gateway for every model call; prompts; fact check; embeddings                                                                                                                                                                                                                            | AI-01…09               |

### 5.2 The pipeline (core of the system)

`PipelineEntry` (candidate × position) carries the recruiter's work on one candidate for one search, as the brief's §2 process describes. Its state machine is in [planning-handoff §3](../discovery/planning-handoff.md#3-pipeline-state-machine-pipelineentry). Implementation rules:

- A transition is one service call, `pipeline.transition(entryId, to, actor, reason?)`. It checks guards, writes `PipelineTransition` (the history every KPI is computed from), updates the entry, writes the activity log and publishes an SSE event, all in **one transaction**.
- Guards are pure functions over the entry and its approvals (JD approval, resume approval, consent, recruiter assessment). Agency settings choose block or warn.
- **The AI never calls `transition`.** HM portal decisions create a `ProposedTransition` that the recruiter confirms (FR-HMP-05).

### 5.3 AI gateway (`server/ai`)

Every model call goes through one function, `ai.run(purpose, input, ctx)`:

1. **Check** that the request came from a user action (`ctx.requestedBy`), or that the purpose is `embedding.index` (the single documented exception, FR-AI-01). Check the agency budget (ADR-013).
2. **Build** the prompt from `prompts/<purpose>.ts`. Each prompt exports a zod schema and a `PROMPT_VERSION`, as in product-manager.
3. **Call** the model with **structured outputs** (`output_config.format` / the SDK's `messages.parse()` with a zod schema; not forced tool choice, which Opus 5.5 rejects, ADR-004) or streaming text. The model is chosen per purpose from a routing table (ADR-005).
4. **Record** an `LlmCall` (model, tokens, cost, promptVersion, agencyId) and an `AiGeneration` (purpose, input record references, output, status `draft`).
5. **Post-process.** Documents (tailored resume, report, outreach) go through the **fact check** (X1). Match analyses go through the score calculator (ADR-007).
6. **Return** the draft. It becomes usable downstream only through `artifacts.approve()` (ADR-006).

Purposes map 1:1 to the AI capability list A1–A18 (planning handoff §4). Protected characteristics are removed from inputs by a **redaction step** in the matching and portfolio purposes (FR-AI-09).

### 5.4 Messaging (`server/messaging`)

`OutboxMessage` rows are created by a user's send action, or by system notifications such as invites and reminders. A `messaging.send` job delivers each one through the agency's configured `Transport`:

- `dev-capture`: stores the message and never delivers it. This is the default in non-production environments and for agencies without a provider.
- `smtp`: nodemailer, as in product-manager.
- `gmail` / `graph`: later, using Interactor credentials.

Suppression and opt-out are checked at enqueue time and again at send time. Details in ADR-009.

### 5.5 Portals (`server/portal`)

Portal APIs (`/api/portal/v1`) read from **portal read models**: `PortalShare` rows that list exactly what an HM or candidate may see. They never query recruiter tables with filters. Portal writes (approvals, consent, feedback, decisions) call the same domain services with a `PortalActor` that has narrow capabilities. Details in ADR-003 and ADR-012.

### 5.6 Platform admin section (`/admin`)

Route group `(admin)/admin/…` and API `/api/admin/v1/…`, guarded by `authorizePlatformAdmin(req, {role})`. The user must have `User.platformRole` (owner, admin or support) and MFA. Non-admins get 404.

- `/admin` reads only platform tables (`Agency`, `User`, `PlatformAdminInvite`, `PlatformAuditLog`, `JobRun`) and **aggregate views** over agency tables (member counts, `LlmCall` cost roll-ups, outbox/job failure counts). The views are owned by a restricted role and exposed as security-definer functions (ADR-001). They return counts and ids only.
- Opening an agency's workspace requires an active `SupportAccessGrant` (release 2). The scoped client then runs `withAgency(agencyId)` in **read-only** mode, and each request is written to both `PlatformAuditLog` and the agency's `ActivityLog`.
- Every `/admin` write (create or suspend agency, budget change, admin invite, configuration change) writes `PlatformAuditLog` in the same transaction.

### 5.7 Jobs and realtime (reused from product-manager)

- `enqueue(queue, name, payload, idempotencyKey)` writes a `JobRun` row, then adds the job. Payloads carry `agencyId` and `requestedBy`, and the worker opens an agency-scoped database context before any query.
- Queues: `ai` (drafts, batch analysis, benchmarks), `documents` (parse, render PDF), `messaging`, `indexing` (embeddings), `maintenance` (reminders, retention).
- Realtime: `pg_notify` → worker `pg-listen` → Redis → `/api/sse/[channel]`. Channels are agency-scoped (`agency:<id>:position:<id>`, `user:<id>`, `job:<id>`). The SSE route checks the channel's agency against the caller.

---

## 6. Data architecture

### 6.1 Model

The Prisma schema is in [apps/web/prisma/schema.prisma](../../apps/web/prisma/schema.prisma) (started as a planning draft, moved in T-F-06) (release 1 entities plus the portal entities that release 1 must anticipate). The domain model is in [planning-handoff §2](../discovery/planning-handoff.md#2-candidate-domain-model). Conventions follow product-manager:

- UUID ids (`@db.Uuid`), camelCase fields, PascalCase models
- `createdAt` and `updatedAt` on every model
- Lowercase enum values; cascades only inside an aggregate

Easemuse-specific rules:

- **Every agency-owned table has `agencyId`**, indexed, first in composite indexes, and covered by an RLS policy (ADR-001).
- **AI-touched artifacts** (structured JD, success profile, candidate profile, match analysis, outreach draft, qualification, tailored resume, submission report, feedback structuring) share the `Artifact` / `ArtifactVersion` / `AiGeneration` pattern (ADR-006). The domain row points to its `approvedVersionId`.
- **Original documents are immutable** (`CandidateDocument`, `JobDescription` with kind `original`). New uploads create new rows.
- **History is append-only**: `PipelineTransition`, `ActivityLog`, `LlmCall`, `AiGeneration`.
- **Embeddings**: a separate `ProfileEmbedding` table (`vector(1024)` per approved profile or success-profile version), HNSW index, raw SQL queries with `<=>` and a mandatory `agency_id` filter (ADR-008).

### 6.2 Storage

| Data                                 | Store                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Relational data, history, embeddings | PostgreSQL 16 + pgvector                                                      |
| Uploaded resumes and JDs (originals) | PostgreSQL `FileBlob` table under RLS; text extracted in the worker (ADR-010) |
| Generated PDFs/DOCX, agency logos    | S3-compatible store, keys `easemuse/<agencyId>/…` (ADR-011)                   |
| Queues, SSE fan-out, rate limits     | Redis                                                                         |

### 6.3 Key data flows

**A. Structure a JD (brief §3.2)**
recruiter clicks _Structure JD_ → `POST /api/v1/positions/:id/jd/structure` → `ai.run('jd.structure')` streams → `AiGeneration` + `ArtifactVersion(draft)` → recruiter edits → `POST …/artifacts/:id/approve` → `Requirement` rows replaced from the approved version → activity log.

**B. Batch match analysis (brief §5.1–5.2)**
recruiter selects N candidates → `POST /api/v1/positions/:id/match-analyses {entryIds}` → one `JobRun` → worker runs `ai.run('match.analyze')` per entry (concurrency-limited) → criterion scores + evidence → `computeOverall(weights)` in code → `MatchAnalysis` with a draft artifact version → SSE progress per entry → dashboard refreshes, showing drafts with an "AI draft" badge → recruiter reviews, optionally overrides, writes the assessment, then **Mark reviewed** (approve) → only reviewed analyses feed call questions and the report. Nothing changes pipeline status.

**C. Submission (brief §9–10)**
Guards are checked: approved profile, approved tailored resume, candidate approval, consent for this client, and recruiter assessment present. Then: report draft (A16) → fact check → recruiter edits, writes section 14 → approve → render PDF (job) → `Submission` created → (release 2) `PortalShare` published to the HM → transition to `SUBMITTED`.

**D. Portal approval (release 2)**
HM opens the magic link (`/api/portal/v1/:agencySlug/magic-link/redeem`) → portal session cookie `em_portal` → `GET /api/portal/v1/shares` → approves the JD → `Approval(source: portal)` → recruiter notified via SSE + task.

**E. Send email (FR-MSG)**
recruiter clicks _Send_ on touch N → suppression check → `OutboxMessage(queued)` → `messaging.send` job → transport → `sent` / `failed` (retry with backoff) → touch marked sent, next touch scheduled as a task.

---

## 7. API design

Conventions are reused from product-manager:

| Item                 | Convention                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layout               | `src/app/api/v1/<resource>/[id]/route.ts`                                                                                                                                                                                                                    |
| Auth first           | `const authed = await authorizeAgency(req, {role}); if (authed instanceof Response) return authed;`                                                                                                                                                          |
| Validation           | zod `safeParse` using schemas from `packages/core`                                                                                                                                                                                                           |
| Success              | `{ data }`                                                                                                                                                                                                                                                   |
| Error                | `{ error: { code, message, fields? } }` with snake_case codes: `unauthenticated` 401, `not_found` 404 (also used for "not your agency"), `forbidden` 403, `invalid_input` 422, `conflict` 409, `guard_failed` 409, `budget_exceeded` 402, `rate_limited` 429 |
| Pagination           | Opaque keyset `nextCursor`                                                                                                                                                                                                                                   |
| Route classification | Every route declares its audience (`agency`, `portal`, `admin`, `public`); a guard test fails on unclassified routes (product-manager `_route-auth-gate` pattern)                                                                                            |
| Long operations      | Return `202 { data: { jobRunId } }`; progress over SSE `job:<id>`                                                                                                                                                                                            |
| Streaming drafts     | `text/event-stream` responses for A1, A12, A15, A16                                                                                                                                                                                                          |

The release 1 endpoint list and payload contracts are in [api-contracts.md](./api-contracts.md).

---

## 8. Security architecture

| Area             | Design                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication   | Agency users and platform administrators: Interactor Account Server OIDC via Auth.js v5 (JWT session). Portal users: app-issued magic links, single-use and expiring (ADR-002)                                                   |
| Authorization    | Three layers: agency (RLS + scoped client), client (within an agency) and role/ownership. Portal audiences use separate APIs and read models. Platform administrators only through a time-limited `SupportAccessGrant` (ADR-012) |
| Tenant isolation | RLS policies keyed on `app.agency_id`, set per transaction by the scoped client. The web runtime's DB role cannot bypass RLS; only migrations use the owner role. Isolation test suite in CI (ADR-001)                           |
| AI data          | Zero-retention API terms; protected-attribute redaction before matching; no candidate data in logs (pino-style redaction)                                                                                                        |
| Files            | Originals in Postgres under RLS; generated files under S3 keys namespaced by agency; downloads go through authorized routes, never public URLs                                                                                   |
| Abuse            | Rate limits on portal and public routes, magic-link issuance, and AI endpoints (per agency)                                                                                                                                      |
| Audit            | Append-only `ActivityLog`, `PipelineTransition`, `AiGeneration`; platform administrator access logged and visible to the agency (FR-TEN-07)                                                                                      |
| Privacy          | Candidate export/delete flows (FR-PLT-08); per-agency retention settings; U.S. state privacy rules first                                                                                                                         |
| Secrets          | gitleaks; env config validated at startup                                                                                                                                                                                        |

---

## 9. Scalability and performance

- **Web** is stateless and scales horizontally. **Worker** concurrency is set per queue. The `ai` queue is rate-limited per agency (BullMQ group or limiter) so one agency can't starve others (NFR-SC03).
- **Database**: pooled `pg.Pool` with role-specific settings (product-manager `db-pool-config`). Composite indexes lead with `agencyId`. The dashboard read model uses one query per position with the latest analysis via a lateral join. KPI aggregation moves to materialized summaries if needed (release 2).
- **Search**: Postgres full-text (`tsvector`) over approved profiles plus pgvector similarity, both filtered by agency (NFR-P03 < 2 s at 50k candidates per agency).
- **AI latency**: streaming for long drafts; batch analysis in jobs; prompt caching for shared system prompts and success profiles across a batch.

---

## 10. Observability

| Signal                                     | Source                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| AI cost and latency per purpose and agency | `LlmCall`                                                                                  |
| Draft quality                              | `AiGeneration`: approved vs edited vs discarded; edit distance (BR-002 trigger)            |
| Job health                                 | `JobRun` status, retries, durations                                                        |
| Isolation                                  | RLS denials logged; isolation test results in CI                                           |
| Product metrics (brief §1.1)               | Positions per recruiter, time per position, from `PipelineTransition` and position history |

---

## 11. Infrastructure

Out of scope for these documents (per product owner). The application assumes it runs as two process types (`web`, `worker`) with PostgreSQL 16 (pgvector), Redis and the external services above, configured through environment variables validated at startup.

---

## 12. Trade-offs

| Decision                                       | Gain                                                        | Cost                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| RLS on top of app scoping                      | Database-level guarantee against leaks                      | Per-transaction `set_config`; careful pooling; raw SQL must respect it (ADR-001) |
| Modular monolith                               | Simplicity, shared types, transactions                      | Must police module boundaries (import-cycle check)                               |
| Direct LLM calls rather than Interactor agents | Full control of draft/approval flow and provenance; simpler | Do not reuse agent tooling; revisit for System 12 assistants (ADR-004)           |
| Portal read models                             | Hard to leak recruiter-only data                            | Some duplication when publishing shares                                          |
| Score computed in code                         | Explainable, stable, recomputable                           | LLM can only score criteria, not "feel" overall fit (by design, brief §5.2)      |
| Outbox for all email                           | Uniform logging, retries, test mode                         | Extra table and job per message                                                  |

## 13. Risks

See [risks.md](./risks.md). Architecture-specific: TR-001 (isolation), TR-005 (portal leakage), TR-007 (RLS + pooling), TR-008 (now resolved by ADR-002: portal users don't need Account Server accounts), TR-010 (score stability).

## 14. Brief traceability

| Brief section                       | Modules                    | ADRs          |
| ----------------------------------- | -------------------------- | ------------- |
| §1.1 Design principles              | ai, audit, pipeline guards | 004, 006, 007 |
| §2 Process / §2.1 roles             | pipeline (all modules)     | 006           |
| §3 Intake & JD                      | intake, ai                 | 005, 006      |
| §3.3 Market benchmarking            | intake, ai (web search)    | 005           |
| §4 Sourcing & talent pool           | sourcing, ai, documents    | 008, 010      |
| §5 Matching                         | matching, ai               | 007           |
| §6 Screening                        | screening                  | —             |
| §7 Outreach                         | outreach, messaging, tasks | 009           |
| §8 Qualification                    | qualification, ai          | 006           |
| §9 Resume                           | documents, ai (fact check) | 006, 011      |
| §10 Submission                      | submission, portal         | 003, 011      |
| §11 Interview & feedback            | interviews, portal         | 003           |
| §12 Offer & closing                 | offers, tasks              | —             |
| §13 Analytics                       | analytics                  | —             |
| §14 Experience reuse                | knowledge                  | 008           |
| §15 Structure (Recruiter / AI / HM) | identity, portal, ai       | 002, 003, 012 |

## 15. Approval

| Role          | Name | Date |
| ------------- | ---- | ---- |
| Tech lead     |      |      |
| Product owner |      |      |
