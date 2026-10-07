# Task Breakdown

| Field | Value |
|-------|-------|
| **Project** | EaseMuse AI-Assisted Recruiter Workbench |
| **Date** | 2026-10-06 |
| **Scope** | **Release 1 fully broken down** (every task < 1 day). Releases 2–3 at story level, to be broken down at the start of each release (rolling-wave planning, so later tasks reflect what release 1 teaches) |
| **Sources** | `init.docx` (brief §), [user-stories.md](../discovery/user-stories.md), [architecture.md](./architecture.md), [ADRs](./decisions/README.md) |

**Progress:** T-F-01 to T-F-25 done 2026-10-06/07, except that T-F-23 still needs real resumes and a live fallback run (spike results: [tr-007-rls-pooling](./spikes/tr-007-rls-pooling.md), [tf-23-extraction-quality](./spikes/tf-23-extraction-quality.md)).

**Also done 2026-10-07:** T-ADM-01, T-13-01, T-13-02, T-13-03, plus T-ADM-02 (suspend / reactivate with a required reason), the audit-log writer from T-ADM-05, the outbox core and capture transports from T-5-01 / T-5-02 (SMTP is still open) and the invitation email from T-5-05. Open here: the audit page (T-ADM-05), usage figures on the agency page (T-ADM-04) and the last-owner rule for platform admins (T-ADM-03).

Estimates are ideal engineering hours (≤ 8 = under one day). "Dep" lists blocking tasks. Every AI task includes adding its cases to the eval set (T-QA-03) and an isolation test for its routes (T-QA-01).

---

## Epic overview

| Epic | Name | Brief § | Release | Priority |
|------|------|---------|---------|----------|
| F | Foundation (repo, DB + RLS, auth, jobs, realtime) | — | 1 | Must |
| AI | AI gateway, artifacts, fact check | §1.1, §15② | 1 | Must |
| E13 | Agency & tenancy | SaaS decision | 1 (core), 2 (commercial) | Must |
| E16 | Platform admin `/admin` | Decision 2026-10-06 | 1 (core), 2 (support access, billing, health, config) | Must |
| E0 | Platform: tasks, activity, data rights | §1, §7.2, §11–12 | 1 | Must |
| E1 | Intake & JD | §3 | 1 (3.3 in 3) | Must |
| E2 | Sourcing & talent pool | §4 | 1 (4.3 in 3) | Must |
| E3 | Matching | §5 | 1 | Must |
| E4 | Screening | §6 | 1 | Must |
| E5 | Outreach & messaging | §7 | 1 | Must |
| E6 | Qualification | §8 | 1 | Must |
| E7 | Resume preparation | §9 | 1 | Must |
| E8 | Submission | §10 | 1 | Must |
| E9 / E10 | Interview / Offer (minimal) | §11, §12 | 1 (minimal), 2 | Must |
| QA | Isolation, permissions, AI eval, E2E | §1.1 | 1 | Must |
| E11, E12, E14, E15 | Analytics, reuse, HM portal, candidate portal | §13, §14, §15③ | 2–3 | Must/Should |

---

## Release 1: multi-tenant core loop (intake → submission)

### F: Foundation

| ID | Task | Est (h) | Dep | Refs |
|----|------|---------|-----|------|
| T-F-01 | Scaffold pnpm 10.18 workspace + Turborepo, Node 24, TS 6; `apps/web` (Next.js 16, React 19.2), `packages/core`, `packages/tokens` | 4 | — | C5 |
| T-F-02 | Port quality tooling from product-manager: ESLint 9 config (incl. JSX literal-string rule), Prettier, commitlint, license-header script, import-cycle check, gitleaks config | 4 | F-01 | Q-31 (header text) |
| T-F-03 | Vitest 4 setup (node + jsdom projects, colocated tests, guard-test convention); Playwright + axe setup | 4 | F-01 | NFR-U01 |
| T-F-04 | Env validation module (zod) and config for DB, Redis, Account Server (client id/secret from env), Anthropic, Voyage, S3, SMTP | 3 | F-01 | — |
| T-F-05 | `lib/db`: `pg.Pool` + PrismaPg adapter, per-role pool config (web/worker), Prisma 7.8 config | 3 | F-04 | ADR-001 |
| T-F-06 | Move `schema-draft.prisma` into `apps/web/prisma`; first migration; enable `vector` extension | 3 | F-05 | schema-draft |
| T-F-07 | **Spike (TR-007):** RLS + interactive transaction + `set_config(..., true)` under pooled connections; measure p95 overhead; two agencies on pool size 1 | 6 | F-06 | ADR-001 |
| T-F-08 | RLS migration: `easemuse_app` role (no BYPASSRLS, not owner), `ENABLE`/`FORCE` RLS + `agency_isolation` policy on every agency table; startup check refuses owner connections | 6 | F-07 | ADR-001, US-1301 |
| T-F-09 | `withAgency(agencyId, fn)` scoped client; lint ban on importing the base client outside `lib/db` | 5 | F-08 | ADR-001 |
| T-F-10 | Guard test: every table with `agencyId` has RLS enabled + forced + policy | 3 | F-08 | ADR-001 |
| T-F-11 | Auth.js v5 with Interactor OIDC (port `auth.ts`, providers, callbacks); `User` upsert by `sub`; session shape | 6 | F-05 | ADR-002, US-001 |
| T-F-12 | `authorizeAgency` / `authorizePlatformAdmin` wrappers (membership per request, 404 across agencies) + `resolveActor` | 5 | F-09, F-11 | ADR-012, US-002 |
| T-F-13 | Route classification guard test (`agency/portal/admin/public`) + rate-limit requirement for public writes | 3 | F-12 | ADR-012 |
| T-F-14 | HTTP helpers: `{data}` / `{error:{code,message,fields}}`, zod error mapping, keyset pagination | 3 | F-01 | API conventions |
| T-F-15 | Queue layer: `enqueue` with `JobRun` + idempotency key; queues `ai`, `documents`, `messaging`, `indexing`, `maintenance` | 4 | F-06 | arch §5.6 |
| T-F-16 | Worker entry: dispatcher, `withAgency` around every job, per-agency limiter on `ai` queue | 5 | F-09, F-15 | ADR-013 |
| T-F-17 | Realtime: port `publish` (pg_notify), worker `pg-listen`, Redis channel hub | 5 | F-16 | arch §5.6 |
| T-F-18 | SSE route `/api/sse/[channel]` with agency/user/job channel checks + `useChannel` hook | 4 | F-12, F-17 | — |
| T-F-19 | next-intl setup (`en` complete, `ko` skeleton), locale from user/agency | 3 | F-01 | ADR-015 |
| T-F-20 | UI kit: port Radix wrappers (modal, tabs, tooltip, badge, toast), tokens → CSS vars, app shell (agency switcher, nav, "AI draft" badge) | 8 | F-19 | NFR-U01 |
| T-F-21 | Interactor clients (port `service-urls`, service token) + document extraction module: `FileBlob` storage, PDF text layer, DOCX conversion, quality heuristic, PDF-to-Claude fallback | 7 | F-04, F-09 | ADR-010, 014 |
| T-F-22 | S3-compatible storage helper + `FileObject` service (sha256, authorized download route) | 4 | F-09 | ADR-011, FR-PLT-05 |
| T-F-23 | **Spike:** extraction quality on the 30 collected JDs and sample resumes; tune the low-quality threshold for the PDF-to-Claude fallback; confirm 10 MB limit | 4 | F-21 | ADR-010, TR-006 |
| T-F-24 | MFA enforcement for agency admins and recruiters (check Account Server `amr`/`acr` claims; record a risk if unsupported) | 3 | F-11 | FR-PLT-01, NFR-S01, US-001 |
| T-F-25 | Pre-agency lookups: `Membership` user-scoped policy + `app.user_id` in scoped client; slug-scoped invite-accept route | 4 | F-09, F-12 | ADR-001 |

### E13: Agency & tenancy (release 1 core)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-13-01 | `/admin` agencies: list/search, detail (metadata + usage), create with first agency-admin invite (`/api/admin/v1/agencies`) | 6 | ADM-01, F-22 | US-1302, US-1602 |
| T-13-02 | Member invites (`MemberInvite`: hashed token, expiry, email via outbox), slug-scoped accept flow, membership creation | 6 | 13-01, 5-05, F-25 | US-1302 |
| T-13-03 | Members list / role change / deactivate (API + admin UI) | 5 | 13-02 | US-1303 |
| T-13-04 | Agency settings (API + UI): default weights, outreach intervals, guard modes block/warn, rejection reasons, visibility rule | 6 | F-12 | US-1303, ADR-012 |
| T-13-05 | Usage page: month-to-date AI cost by purpose vs budget; 80%/100% warnings | 4 | AI-03 | US-1304 |

### E16: Platform admin `/admin` (Team of Wakers)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-ADM-01 | `(admin)` route group + `/api/admin/v1` route class; `authorizePlatformAdmin` (platformRole + MFA, 404 otherwise); admin layout and nav | 4 | F-12, F-24 | US-1601, FR-ADM-01 |
| T-ADM-02 | Suspend / reactivate agency: sign-in block message, API refusal, worker skips suspended agencies; reason required | 4 | 13-01, F-16 | US-1602, FR-ADM-03 |
| T-ADM-03 | Platform admins: invite by email (`PlatformAdminInvite`), role change, remove; last-owner rule | 5 | ADM-01, 5-05 | US-1603, FR-ADM-04 |
| T-ADM-04 | Aggregate views for `/admin` (security-definer functions: member counts, `LlmCall` roll-ups by agency/purpose/model/day) + usage page + per-agency budget edit | 7 | AI-03, ADM-01 | US-1604, FR-ADM-05 |
| T-ADM-05 | `PlatformAuditLog` service (written in the same transaction as each `/admin` action) + searchable audit page | 4 | ADM-01 | US-1605, FR-ADM-06 |

### AI: Gateway, artifacts, fact check

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-AI-01 | `server/ai` gateway skeleton: `ai.run(purpose, input, ctx)`, requester check + `embedding.index` exception, routing table (Opus 5.5, per-purpose effort) | 6 | F-09 | ADR-004/005, FR-AI-01 |
| T-AI-02 | Anthropic SDK adapter: structured outputs via `output_config.format`/`messages.parse()` + zod; streaming helper; `stop_reason` handling (refusal, max_tokens); server-side fallback | 6 | AI-01 | ADR-004/005 |
| T-AI-03 | `LlmCall` ledger + price table; `AiGeneration` provenance with input refs; budget gate (402) | 5 | AI-01 | ADR-013, FR-AI-03/08 |
| T-AI-04 | Artifact service: create draft version, human edit version (zod-validated per kind), discard | 6 | F-09 | ADR-006, US-003 |
| T-AI-05 | `artifacts.approve()` with kind rules (human-only fields, fact-check resolution), supersede, stale marking hook, activity log | 6 | AI-04 | ADR-006 |
| T-AI-06 | Guard test: domain modules may read only approved versions | 2 | AI-05 | FR-AI-02 |
| T-AI-07 | Kind schema registry in `packages/core` (16 kinds, start with release 1 kinds) | 4 | F-01 | ADR-006 |
| T-AI-08 | Fact check step 1 (deterministic): entity/number extraction from draft vs approved profile + source text | 7 | AI-04 | ADR-006, US-005, §9.1 |
| T-AI-09 | Fact check step 2: LLM verifier purpose for unsupported claims; warning resolution model | 5 | AI-08, AI-02 | ADR-006 |
| T-AI-10 | Generic artifact editor UI: draft badge, streaming render, edit, diff vs AI original, approve/discard bar, fact-check warning panel | 8 | AI-05, F-20 | US-003/005 |
| T-AI-11 | Provenance view (admin): model, prompt version, inputs, cost | 3 | AI-03 | US-004 |
| T-AI-12 | Protected-attribute redaction utility (structured fields, photo, DOB) used by matching inputs | 4 | AI-01 | FR-AI-09 |
| T-AI-13 | Evidence references: schema + UI hover linking claims to source excerpts / "Inferred" label | 5 | AI-10 | FR-AI-05, US-004 |
| T-AI-14 | Draft-quality metric: edit distance between AI draft and approved version, per purpose and agency (BR-002 trigger) | 3 | AI-05 | ADR-006, BR-002 |
| T-AI-15 | Nightly orphan report for artifacts whose polymorphic subject no longer exists | 2 | AI-04, F-16 | ADR-006 |

### E1: Intake & JD (brief §3.1, §3.2, §3.4)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-1-01 | Clients + contacts API (CRUD, archive, same-name hint) | 4 | F-12 | US-101, §3.1 |
| T-1-02 | Clients UI (list, create, contacts) | 4 | 1-01, F-20 | US-101 |
| T-1-03 | Position API with §3.1 fields, statuses, owner | 4 | 1-01 | US-102 |
| T-1-04 | Position create/edit form (react-hook-form + zod) and position page shell | 6 | 1-03 | US-102 |
| T-1-05 | JD original upload/paste → `FileBlob` → extracted text (worker); unreadable-file error path | 5 | F-21, 1-03 | US-102/103, ADR-010 |
| T-1-06 | Prompt A1 `jd.structure` + StructuredJD schema (13 sections, requirement categories, missing items) | 6 | AI-02, AI-07 | US-103, §3.2 |
| T-1-07 | Structure-JD UI: stream into editor; requirement list with category select, reorder, add/delete; approve → `Requirement` rows | 8 | 1-06, AI-10 | US-103 |
| T-1-08 | Prompt A2 intake questions (missing items + 10 §3.4 topics) + UI copy/export | 4 | 1-06 | US-104 |
| T-1-09 | Intake record form (10 topics) + JD approval recording; guard "sourcing requires JD approval" | 5 | 1-04 | US-106, §3.4 |
| T-1-10 | Prompt A5 success profile + UI (versioned, confirm) | 6 | 1-07, 1-09 | US-107, §3.4 |
| T-1-11 | PDF render pipeline (print route + Chromium job + FileObject + content hash) | 7 | F-15, F-22 | ADR-011 |
| T-1-12 | Improved JD export: DOCX (`docx`) + PDF via 1-11, agency branding | 5 | 1-07, 1-11 | US-105 |
| T-1-13 | Matching weights editor (sum = 100, logged; recomputes overall scores without AI) on position | 3 | 1-03 | US-301, §5.1, ADR-007 |
| T-1-14 | Position status service: all status changes go through it and write `PositionTransition` (Time-to-Fill, positions per recruiter) | 4 | 1-03 | brief §1.1, planning-handoff §6 |

### E2: Sourcing & talent pool (brief §4.1, §4.2)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-2-01 | Prompt A6 search criteria + UI (copyable sheet) | 4 | 1-10 | US-201, §4.1 |
| T-2-02 | Candidate intake API: upload/paste + source → `FileBlob` → extraction → `CandidateDraft` job | 5 | F-21, F-15 | US-202 |
| T-2-03 | Prompt A7 profile structuring (§4.2 14 fields; empty-not-guessed; inference labels) + PDF-to-model fallback | 7 | AI-02, 2-02 | US-202, ADR-010 |
| T-2-04 | Duplicate detection service (email, phone, profile URL, name + employer similarity) | 5 | 2-02 | US-203 |
| T-2-05 | Candidate draft review UI: profile editor, duplicate panel (merge/link/create with reason), confirm | 8 | 2-03, 2-04, AI-10 | US-202/203 |
| T-2-06 | Merge implementation (keep both documents and history) | 4 | 2-05 | US-203 |
| T-2-07 | Add candidates to positions (pipeline entries, state `sourced`) | 3 | 2-05, 3-01 | US-204 |
| T-2-08 | Full-text index (`tsvector`, GIN) + denormalized filter columns (title, location, seniority, skills, availability) refreshed on profile approval | 4 | AI-05 | US-207, ADR-008 |
| T-2-09 | Pool search API (text + filters, keyset) + perf test at 50k seeded candidates | 6 | 2-08 | US-207, NFR-P03 |
| T-2-10 | Pool search UI + global search box (clients, positions, candidates) | 6 | 2-09 | US-207, FR-PLT-06 |
| T-2-11 | Do-not-contact flag (set by recruiter, clear by admin, reason, logged) | 3 | 2-05 | US-208 |
| T-2-12 | Candidate page (profile, documents, positions, activity) | 6 | 2-05 | §4.2 |

### E3: Matching (brief §5)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-3-01 | Pipeline service: `transition()` with guards, `PipelineTransition`, activity, SSE, one transaction | 7 | F-09, F-17 | handoff §3 |
| T-3-02 | Guard library (JD approval, resume approval, consent, recruiter assessment) with block/warn + override reasons | 5 | 3-01 | US-402/702/801 |
| T-3-03 | Prompt A10 match analysis (7 criteria, rubric anchors, evidence, must-have/disqualifying status, to-confirm) | 8 | AI-02, AI-12, 1-10 | US-302, ADR-007 |
| T-3-04 | Score calculator (weighted sum in code), recompute on weight change without AI | 3 | 3-03 | ADR-007 |
| T-3-05 | Batch analysis job (1–50 entries), per-entry SSE progress, single-entry streaming path | 6 | 3-03, F-18 | US-302 |
| T-3-06 | Override API (overall/criterion + reason) and recruiter assessment (human-only) | 4 | 3-04 | US-303, FR-MAT-05 |
| T-3-07 | Dashboard read model (latest analysis per entry, §5.3 columns) | 5 | 3-04 | US-304 |
| T-3-08 | Dashboard UI: sort/filter, drag manual order (persisted), override marker, must-have status chips | 8 | 3-07 | US-304, §5.3 |
| T-3-09 | Match analysis detail view (criteria, evidence hovers, gaps, to-confirm) | 6 | 3-05, AI-13 | US-302 |
| T-3-10 | Explain-only mode setting (hide numeric scores) | 2 | 3-08 | ADR-007, Q-06 |
| T-3-11 | "Mark reviewed" for match analyses (approve artifact) + guard: A13/A16 use reviewed analyses only | 3 | 3-09 | ADR-006, FR-AI-02 |

### E4: Screening (brief §6)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-4-01 | Screening checklist API + UI (14 items, rating + notes) | 6 | 3-01 | US-401 |
| T-4-02 | Classification (Priority/Potential/Hold/Not Qualified with reason) via transition | 3 | 4-01, 3-02 | US-402 |

### E5: Outreach & messaging (brief §7)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-5-01 | Messaging core: `OutboxMessage`, `Transport` interface, `messaging.send` job with retries/backoff | 6 | F-15 | ADR-009 |
| T-5-02 | Transports: `dev-capture`, `log-only`, `smtp` (nodemailer port) + per-agency selection | 5 | 5-01 | ADR-009 |
| T-5-03 | Suppression + signed unsubscribe public route (rate-limited) + DNC linkage | 5 | 5-01, 2-11 | FR-MSG-05, US-504 |
| T-5-04 | Admin outbox view (incl. dev-capture inbox) | 3 | 5-02 | FR-MSG-02 |
| T-5-05 | Email templates (invite, notification) localized | 3 | 5-02, F-19 | ADR-015 |
| T-5-06 | Sequence setup (channel, intervals from agency defaults) creating touches + tasks | 4 | 3-01, 0-01 | US-502 |
| T-5-07 | Prompt A12 outreach (Why You / Why This Role / Why Now; §7.3 elements toggles; channel length limits; touch number) | 7 | AI-02, 1-10 | US-501 |
| T-5-08 | Outreach composer UI (draft, toggles, regenerate, approve, DNC block, recently-contacted warning) | 7 | 5-07, AI-10 | US-501/503 |
| T-5-09 | Send email (approved version → outbox) and copy & mark sent for LinkedIn/text/phone | 4 | 5-08, 5-02 | US-503/504 |
| T-5-10 | Response tracking; cancel remaining touches on reply; state transitions | 4 | 5-09, 3-01 | US-502, FR-OUT-05 |

### E6: Qualification (brief §8)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-6-01 | Prompt A13 call questions (§8 topics + to-confirm items from the reviewed match analysis) + UI | 4 | 3-11 | US-601 |
| T-6-02 | Prompt A14 notes → qualification fields + review UI (confirm each field) | 7 | AI-10 | US-602 |

### E7: Resume preparation (brief §9)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-7-01 | Prompt A15 tailored resume (emphasis only, facts locked, blind option) | 7 | AI-02, 1-10 | US-701, §9.1 |
| T-7-02 | Tailored resume editor with fact-check panel; original side by side | 6 | 7-01, AI-09, AI-10 | US-701/005 |
| T-7-03 | Resume DOCX + PDF rendering with agency template | 6 | 7-02, 1-11 | US-701, ADR-011 |
| T-7-04 | Recorded approvals (resume) + consent per client as append-only given/withdrawn rows (API + UI) | 5 | 7-02 | US-702, FR-CDP-03 |

### E8: Submission (brief §10)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-8-01 | Prompt A16 submission report (sections 1–13; missing inputs list; section 14 left empty) | 7 | AI-02, 6-02, 7-01, 3-11 | US-801 |
| T-8-02 | Report editor (section 14 human-only, approve blocked if empty / fact-check unresolved) | 6 | 8-01, AI-10 | US-801 |
| T-8-03 | Submission report PDF template (14 sections, agency branding) | 6 | 8-02, 1-11 | US-802 |
| T-8-04 | Record submission (guards; pins report/resume versions and the exact PDF/DOCX files sent; transition to `submitted`) + portal snapshot builder (used later by ADR-003) | 6 | 8-03, 3-02 | US-802, ADR-003 |

### E9 / E10: Interview and offer (minimal)

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-9-01 | Interview rounds API + UI (status, next/hold/reject with reason code from agency taxonomy, final) + tasks for upcoming | 7 | 3-01, 0-01, 13-04 | US-901, §11, FR-IVW-02 |
| T-10-01 | Offer record API + UI (§12 9 milestones, counteroffer risk, outcomes); position → filled when accepted placements equal openings | 7 | 3-01, 1-14 | US-1001, §12, FR-OFF-03 |

### E0: Platform

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-0-01 | Task engine (create/complete/snooze) + "My tasks today" page | 7 | F-12 | US-006 |
| T-0-02 | Activity log service + entity timeline component | 5 | F-09 | US-007 |
| T-0-03 | Append-only grants on audit tables; separate data-rights role | 3 | F-08 | ADR-016 |
| T-0-04 | Candidate export job (ZIP: JSON + originals) | 5 | 0-03, F-22 | US-008 |
| T-0-05 | Candidate anonymization job (files, versions, embeddings, PII redaction; keep transitions) + fixture test | 8 | 0-03 | US-008, ADR-016 |
| T-0-06 | Privacy request records (export/delete) with deadline tracking and tasks | 3 | 0-03, 0-01 | FR-PLT-08 |

### QA: Cross-cutting quality

| ID | Task | Est | Dep | Refs |
|----|------|-----|-----|------|
| T-QA-01 | Isolation test harness (agencies A/B, every route, expect 404 + zero rows) | 6 | F-13 | TR-001, US-1301 |
| T-QA-02 | Permission matrix test (role × endpoint) | 5 | F-13 | ADR-012 |
| T-QA-03 | AI eval harness (`apps/web/evals`): per-purpose cases, graders, cost per run | 8 | AI-02 | NFR-AI01 |
| T-QA-04 | Assemble eval set (30 public JDs in `eval-data/`, 100 resumes per Q-18 decision; labelled) | 8 | QA-03, Q-18 | TR-004 |
| T-QA-05 | Paired-resume bias test + score stability test (5 runs ≤ 5 pts) | 5 | 3-03, QA-03 | NFR-AI04, TR-010 |
| T-QA-06 | E2E happy path (Playwright): create position → structure JD → approve → success profile → add candidate → analyze → screen → outreach (dev-capture) → qualify → tailor → report → submit | 8 | 8-04 | Release 1 exit |
| T-QA-07 | axe checks on all release 1 pages | 4 | QA-06 | NFR-U01 |
| T-QA-08 | Background-job isolation tests (job for agency A cannot read or write agency B; missing context fails closed) | 4 | F-16, QA-01 | US-1301, ADR-001 |

**Release 1 total:** 125 tasks, 631 ideal hours (≈ 15.8 engineer-weeks at ~40 focused h/week, before review, bug fixing and buffer). With 3 engineers, plan **~8 two-week sprints** including a 30% buffer. Planning guidance, not a commitment: re-estimate after sprint 1 (spike T-F-07 and eval data are the main unknowns).

### Critical path

```
F-01 → F-05 → F-06 → F-07 (RLS spike) → F-08 → F-09 → F-12 ──┬─→ AI-01 → AI-02 → 1-06 → 1-07 → 1-10 → 3-03 → 3-05 ──┐
                                                             │                                                       ├→ 8-01 → 8-02 → 8-03 → 8-04 → QA-06
                                                             └─→ 1-01 → 1-03 → 1-05 ; 2-02 → 2-03 → 2-05 ──→ 7-01 ───┘
```

### Suggested sprint plan (3 engineers)

| Sprint | Goal | Tasks |
|--------|------|-------|
| 1 | Foundation + RLS proven | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10, F-14; request eval data (Q-18) |
| 2 | Auth, jobs, realtime, AI gateway | ADM-01, F-23, F-24, F-25, F-11, F-12, F-13, F-15, F-16, F-17, F-18, F-19, F-20, F-21, F-22, AI-01, AI-02, AI-03, 13-01, QA-01 |
| 3 | Artifacts, intake, messaging core | ADM-05, 1-14, QA-08, AI-04, AI-05, AI-06, AI-07, AI-10, 1-01, 1-02, 1-03, 1-04, 1-05, 1-06, 1-07, 5-01, 5-02, 5-05, QA-03 |
| 4 | Success profile, sourcing, pipeline core | ADM-02, ADM-03, 1-08, 1-09, 1-10, 1-11, 1-12, 1-13, 2-01, 2-02, 2-03, 2-04, 2-05, 2-06, 2-07, 3-01, 3-02, AI-12, 13-02, 13-03, 13-04 |
| 5 | Matching + pool search | 3-11, 3-03, 3-04, 3-05, 3-06, 3-07, 3-08, 3-09, 3-10, 2-08, 2-09, 2-10, 2-11, 2-12, AI-13, QA-04 |
| 6 | Screening, outreach, fact check | ADM-04, AI-14, 4-01, 4-02, 5-03, 5-04, 5-06, 5-07, 5-08, 5-09, 5-10, 0-01, 0-02, AI-08, AI-09, AI-11 |
| 7 | Qualification, resume, submission | 6-01, 6-02, 7-01, 7-02, 7-03, 7-04, 8-01, 8-02, 8-03, 8-04 |
| 8 | Interview/offer minimal, data rights, hardening | AI-15, 0-06, 9-01, 10-01, 0-03, 0-04, 0-05, 13-05, QA-02, QA-05, QA-06, QA-07 |

---

## Release 2: portals, through to start date, KPIs, billing (story level)

| Story | Epic | Notes for breakdown |
|-------|------|---------------------|
| US-1401, 1402, 1404, 1405 | E14 HM portal | ADR-002 portal auth, ADR-003 publish/snapshots, ProposedTransition resolution UI |
| US-1501…1503, 1505, 1507 | E15 Candidate portal | Consent via portal, privacy requests, status snapshots |
| US-902, 903 | E9 Feedback | Structured HM feedback (also from portal), A17 |
| US-1002 | E10 Reminders to start | Maintenance jobs, tasks |
| US-1101, 1102 | E11 KPIs | Formulas in planning-handoff §6 from `PipelineTransition` |
| US-1606, FR-ADM-07…10 | E16 `/admin` release 2 | Support access (with US-1305), plans/billing, tenant export/deletion with two-person approval, system health, platform configuration |
| US-1305…1308 | E13 Commercial | Platform admin section (`/admin`), support grants, branding, tenant export, Billing Server; tenant deletion job with table-coverage guard test (ADR-016) |
| FR-OUT-06 | E5 Outreach templates | `OutreachTemplate` model, template picker in composer |
| US-505 | E5 Real mail provider | Interactor credentials + webhooks (ADR-009, 014) |
| US-305, US-803 | E3/E8 | Stale analysis, duplicate submission guard |
| FR-SRC-09 (tags/notes), FR-SRC-10, Q-10 | E2 | Tags, bulk upload, CSV/ATS import |
| Security | — | Pen test, DPA/terms, sub-processor list before first external agency |

## Release 3: pool intelligence, reuse, benchmarking (story level)

| Story | Epic | Notes |
|-------|------|-------|
| US-205, 206 | E2 | Voyage embeddings (ADR-008), similar candidates, portfolio |
| US-1201, 1202 | E12 | Client history, pattern reports (all 7 §14 questions), A18 |
| US-108 | E1 | Benchmark: web search two-step + own data (ADR-005) |
| US-1403, 1406, 1504 | E14/E15 | HM online intake, interview slots, candidate self-updates |
| Could items | — | SMS, calendar, call transcripts (Q-20) |
