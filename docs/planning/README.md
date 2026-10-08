# EaseMuse Planning (Phase 2)

**Status**: v0.2 (2026-10-06). **All ADRs accepted by the product owner.** Product owned and maintained by Team of Wakers.
**Source of truth**: `init.docx`, plus the product-owner decisions in [discovery/open-questions.md](../discovery/open-questions.md).

## Documents

| Document                                             | What it contains                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)                 | Modular monolith + worker on the product-manager stack; modules traced to brief sections; tenancy, AI gateway, messaging, portals, security, data flows |
| [schema.prisma](../../apps/web/prisma/schema.prisma) | Data model (moved to `apps/web/prisma` in T-F-06): 47 models, valid under Prisma 7.8 (`prisma validate`), RLS-ready (`agencyId` on every agency table)  |
| [api-contracts.md](./api-contracts.md)               | Release 1 endpoints with roles, bodies, responses, error codes; release 2 portal API outline                                                            |
| [decisions/](./decisions/README.md)                  | ADR-001 to ADR-017                                                                                                                                      |
| [tasks.md](./tasks.md)                               | Release 1: 125 tasks, all < 1 day (631 h), dependencies, critical path, 8-sprint plan. Releases 2–3 at story level                                      |
| [risks.md](./risks.md)                               | 19 risks with mitigations, contingencies and planning actions                                                                                           |

## What changed from the discovery handoff

- **Tenant isolation goes further than product-manager:** Postgres row-level security on top of app scoping (ADR-001). Reason: product-manager's own audit found 11 cross-tenant leaks under app-only scoping.
- **Auth like product-manager:** Interactor login (OIDC via Auth.js) for agency users with an app client id/secret from env; magic links for portal users (ADR-002, Q-32).
- **Structured outputs use the API's native format,** not product-manager's forced tool choice, which Claude Opus 5.5 rejects (ADR-004).
- **Sonnet 5.5 for high-volume extraction, Opus 5.5 for client- and candidate-facing outputs** (ADR-005, Q-33).
- **Platform admin section `/admin`** for Team of Wakers staff: agencies, suspension, platform admins, usage and budgets, audit log in release 1; support access, billing, health and configuration in release 2 (FR-ADM, E16).
- **No Interactor userdb:** originals in EaseMuse's own Postgres (`FileBlob`, under RLS), text extracted in-app (ADR-010, Q-34).
- **Embeddings follow product-manager's Voyage `voyage-3-large`;** release 1 search is full-text only (ADR-008).

## Planning checklist

### Architecture design

- [x] System architecture defined
- [x] Component diagram created (architecture §3, §5)
- [x] Data model designed (schema-draft, validated)
- [x] API contracts specified (release 1; release 2 outlined)
- [x] Integration points identified (Interactor services ADR-014, Anthropic, Voyage, SMTP)

### Technology selection

- [x] Technology stack decided (product owner, C5)
- [x] Framework choices documented (ADRs)
- [ ] Infrastructure requirements defined: **out of scope per product owner**; the app assumes `web` + `worker` processes, Postgres 16 + pgvector, Redis
- [x] Third-party services selected (Anthropic, Voyage, Interactor services, SMTP)

### Task breakdown

- [x] Features broken into tasks (release 1)
- [x] Dependencies identified (checked: no unknown dependencies, no cycles, no sprint scheduled before its dependencies)
- [x] Priority assigned
- [x] Effort estimated

### Risk assessment

- [x] Technical risks identified
- [x] Mitigation strategies defined
- [x] Contingency plans created

### Documentation

- [x] ADRs created (17, accepted)
- [x] Design document drafted
- [x] API documentation started

## Exit gate to implementation

| Gate                                                                           | Status                                                                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Architecture reviewed for stack patterns (Next.js route handlers, not Express) | Draft; review pending                                                                                                            |
| Prisma schema has relations and indexes; valid                                 | `prisma validate` passes (7.8.0); review pending                                                                                 |
| API follows REST conventions                                                   | Draft per product-manager conventions                                                                                            |
| ADRs documented with rationale                                                 | 17 accepted (2026-10-06)                                                                                                         |
| Tasks < 1 day                                                                  | Release 1: all ≤ 8 h                                                                                                             |
| Risks have mitigations                                                         | Yes                                                                                                                              |
| Product-owner decisions                                                        | Q-31 to Q-34 decided; evaluation resumes source open (Q-18)                                                                      |
| Independent validation                                                         | Done: 11 issues and 12 warnings found and fixed (see below); schema re-validated; task dependency and sprint-order checks re-run |

## Validation report (2026-10-06)

An independent review checked these documents against `init.docx`, the discovery documents and each other.

**Status after fixes: PASS.** The brief's enumerated fields (§3.1–§12) are all representable; pipeline states match the handoff; every release 1 Must story has tasks; every task is ≤ 8 h.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                           | Fix                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `JobRun.agencyId` nullable breaks under RLS                                                                                                                                                                                                                                                                                                                       | `JobRun` declared a platform table, not under RLS (ids and status only)                                                                   |
| 2   | `/me`, magic-link redeem and invite accept happen before an agency is known                                                                                                                                                                                                                                                                                       | User-scoped `Membership` policy; `:agencySlug` in redeem and accept routes (ADR-001, T-F-25)                                              |
| 3   | No invite model                                                                                                                                                                                                                                                                                                                                                   | `MemberInvite` added                                                                                                                      |
| 4   | Append-only rule contradicted `AiGeneration` and `Consent` updates                                                                                                                                                                                                                                                                                                | `AiGeneration` removed from append-only list; consent is now given/withdrawn rows                                                         |
| 5   | Match analyses used downstream without approval                                                                                                                                                                                                                                                                                                                   | "Mark reviewed" approval (ADR-006, T-3-11, `POST /match-analyses/:id/review`)                                                             |
| 6   | Criterion-level overrides not storable                                                                                                                                                                                                                                                                                                                            | `MatchAnalysis.criterionOverrides`                                                                                                        |
| 7   | Submission didn't pin what was sent                                                                                                                                                                                                                                                                                                                               | Report/resume version ids and exact file ids on `Submission`                                                                              |
| 8   | No position status history (brief §1.1 metric)                                                                                                                                                                                                                                                                                                                    | `PositionTransition` model + T-1-14                                                                                                       |
| 9   | Tenant deletion by cascade impossible; missing foreign keys                                                                                                                                                                                                                                                                                                       | Explicit per-table deletion job with coverage guard (ADR-016); FKs added for screening, qualification, resume, report, proposals, consent |
| 10  | Architecture still described forced tool calls                                                                                                                                                                                                                                                                                                                    | Changed to structured outputs                                                                                                             |
| 11  | Touch status `failed` missing                                                                                                                                                                                                                                                                                                                                     | Added                                                                                                                                     |
| W   | Search filter columns, cost per position, `bounced` status, rejection reason codes, outreach templates, weight-change behaviour, risk-table inconsistencies, role legend, untasked work (MFA, userdb spike, job isolation tests, orphan report, privacy deadlines, position filled), stale names in architecture, HM intake as proposals, draft storage for A8/A9 | All fixed in schema, ADRs, API contracts and tasks (9 new tasks)                                                                          |
