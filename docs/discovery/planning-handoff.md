# Planning Handoff

| Field       | Value                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose** | Starting material for Phase 2 (architecture document, task breakdown, ADRs, risk register)                                         |
| **Status**  | v0.2 (2026-10-06): multi-tenant SaaS, HM and candidate portals, in-app email. Proposals here are for Planning to confirm or change |
| **Date**    | 2026-10-06                                                                                                                         |

---

## 1. Inputs for Planning

| Planning deliverable | Start from                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Architecture design  | §2 domain model, §3 state machine, §4 AI capability list, [research-notes.md §2](./research-notes.md#2-technical-feasibility) |
| Technology ADRs      | [requirements.md C5](./requirements.md#constraints) (stack fixed), §7 ADR list                                                |
| Task breakdown       | [user-stories.md](./user-stories.md) backlog + §5 release slices                                                              |
| Risk register        | [research-notes.md §4](./research-notes.md#4-risks-surfaced-during-discovery) R1–R14                                          |
| Test plan            | NFR-AI01–05 (AI eval set), Given/When/Then scenarios in user stories                                                          |

---

## 2. Candidate domain model

Entities implied by the brief and the 2026-10-06 decisions. Names are proposals; UUID keys per stack. **Every entity below except platform-level ones carries `tenantId`.**

```
Platform level:
Tenant (agency: plan, region, branding, settings) 1─* Membership (User × Tenant × role: admin|lead|recruiter)
Plan, UsageRecord (AI tokens/cost, seats), SupportAccessGrant (platform administrator access, time-limited, logged)
User (Interactor Account Server identity: platform administrators, agency users)

Tenant level:
PortalUser (HM or candidate; invite-based; linked to ClientContact or Candidate) 1─* Invitation (single-use, expiring)
Client 1─* ClientContact (hiring managers)
Client 1─* Position
Position 1─* JobDescription (versions: original | structured | improved)
Position 1─* Requirement (category: MUST | PREFERRED | NICE | DISQUALIFYING; section)
Position 1─1 IntakeRecord (10 §3.4 fields, JD approval: by/when/how)
Position 1─* SuccessProfile (versioned; confirmed version used for matching)
Position 1─1 MatchingModel (7 weights, sum = 100)
Position 1─* BenchmarkReport (cited sources)               [later release]

Candidate 1─* CandidateDocument (original resumes; never overwritten)
Candidate 1─* CandidateProfile (versioned structured profile)
Candidate *─* Position  via PipelineEntry  ← the central record of a search
Candidate: source, tags, doNotContact, consent/privacy fields

PipelineEntry 1─* MatchAnalysis (criterion scores + evidence, overall, overrides, profile/SP versions used, stale flag)
PipelineEntry 1─1 ScreeningAssessment (14 items, classification)
PipelineEntry 1─1 OutreachSequence 1─* OutreachTouch (channel, draft, sentAt, content)
PipelineEntry 1─1 QualificationRecord (structured fields + raw notes)
PipelineEntry 1─* TailoredResume (approval by candidate)
PipelineEntry 1─* SubmissionReport (14 sections; section 14 recruiter-only; PDF file)
PipelineEntry 1─* Submission (to whom, when, documents)
PipelineEntry 1─* Interview 1─* Feedback (HM structured ratings | candidate feedback)
PipelineEntry 1─1 Offer (milestones, outcome)
PipelineEntry 1─* Consent (candidate consent to submit to a named client; given/withdrawn)
Approval (generic: JD by HM, resume by candidate; approve | changes requested, comments, source: portal | recorded-by-recruiter)
PortalShare (what an HM/candidate can see: position, submission, resume; revocable)

Messaging:
OutboxMessage (tenant, sender, recipient, channel, entity link, content, status queued|sent|failed|bounced, transport, attempts)
TransportConfig (per tenant: dev-capture | log-only | provider X)
Suppression (opt-out / do-not-contact per tenant)

Cross-cutting:
AIGeneration (requester, type, model, promptVersion, inputRefs, output, status: draft|edited|approved|discarded, cost)
ArtifactVersion (diffs between AI draft and recruiter edits)
Task / Reminder (due date, owner, linked entity)
ActivityLog (actor, action, entity, before/after)
Team? (optional, per tenant)
```

Key modeling points for the architecture:

- **PipelineEntry** (candidate × position) holds status and most per-search data. Candidate-level data (profile, documents) is shared across positions.
- **Approved vs draft** must be a first-class concept: every AI-touched artifact has versions and an approval pointer (FR-AI-02/04).
- Match **overall score is derived** (weighted sum in code) from criterion scores; store criterion inputs so it can be recomputed when weights change.
- Separate **client-confidential** fields (compensation, HM feedback) for access control and Q-12.
- **Three permission audiences** read the same records: agency users (full, per role), HMs (only shared submissions for their client), candidates (only their own data). Build portal APIs as separate, narrow read models rather than filtering the recruiter API.
- **Isolation**: tenant scoping enforced in the Prisma layer **and** by Postgres RLS; BullMQ jobs and SSE channels carry tenant context.
- **Approvals** from portals and approvals recorded by recruiters use one model, so guards don't care where approval came from.

---

## 3. Pipeline state machine (PipelineEntry)

Proposed; confirm names with recruiters.

```
SOURCED ─► REVIEWED ─► SCREENED[Priority|Potential|Hold|NotQualified]
                              │ (Priority/Potential)
                              ▼
                          CONTACTING (touch 1..3) ─► NO_RESPONSE | NOT_INTERESTED
                              │ replied interested
                              ▼
                          INTERESTED ─► QUALIFIED ─► RESUME_READY ─► CANDIDATE_APPROVED
                                                                           │
                                                                           ▼
                                                                      SUBMITTED ─► CLIENT_REJECTED
                                                                           │
                                                                           ▼
                                                                    INTERVIEWING (rounds) ─► REJECTED | ON_HOLD
                                                                           │
                                                                           ▼
                                                                      OFFER ─► DECLINED
                                                                           │
                                                                           ▼
                                                                    ACCEPTED ─► RENEGED
                                                                           │
                                                                           ▼
                                                                        STARTED (placement closed)
Any non-terminal state ─► WITHDRAWN (candidate) | CLOSED (position filled/cancelled)
```

Rules:

- Every transition is a **recruiter action** (DP-1/DP-2); none are triggered by AI results.
- Some transitions have guards that **warn or block** (configurable per tenant): Sourcing requires JD approval (FR-INT-10, from HM portal or recorded); Submit requires candidate resume approval (FR-RES-03), **candidate consent for that client** (FR-CDP-03) and a written Recruiter Assessment (US-801).
- HM portal decisions (interview / hold / reject) arrive as **proposed transitions** the recruiter always confirms (FR-HMP-05, DP-1).
- Every transition is timestamped; KPIs (§6) are computed from these timestamps, so the transition history table is required from release 1.

Position states: `DRAFT → INTAKE → SOURCING → INTERVIEWING → OFFER → FILLED | ON_HOLD | CANCELLED`.

---

## 4. AI capability inventory

All recruiter-triggered, draft output, provenance recorded. "Schema" = zod schema shared by AI output, form and API.

| #   | Capability                              | Trigger (UI)                             | Inputs                                                                      | Output schema                                                                        | Sync / job          | FR        |
| --- | --------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- | --------- |
| A1  | JD structuring + requirement categories | Structure JD                             | Original JD text, position fields                                           | StructuredJD, Requirement[]                                                          | Sync (stream)       | INT-04/05 |
| A2  | Intake question list                    | Prepare intake questions                 | StructuredJD, missing items                                                 | Question[]                                                                           | Sync                | INT-06    |
| A3  | Market benchmark + JD improvement       | Benchmark                                | Position, StructuredJD, **LLM web search** results, agency's past positions | BenchmarkReport (web sources and internal records labelled separately), Suggestion[] | Job                 | INT-07    |
| A4  | Improved JD draft                       | Improve JD                               | Approved structure, accepted suggestions                                    | JDDocument                                                                           | Sync                | INT-08    |
| A5  | Success profile                         | Create success profile                   | Approved JD, IntakeRecord                                                   | SuccessProfile                                                                       | Sync                | INT-11    |
| A6  | Search criteria sheet                   | Search criteria                          | SuccessProfile                                                              | SearchCriteria                                                                       | Sync                | SRC-01    |
| A7  | Profile structuring                     | On upload (recruiter action)             | Resume text, source                                                         | CandidateProfile                                                                     | Sync / job for bulk | SRC-03/10 |
| A8  | Similar candidates                      | Find in my pool                          | SuccessProfile embedding, pool                                              | RankedCandidate[] with reasons                                                       | Job                 | SRC-06    |
| A9  | Candidate portfolio                     | Check open positions                     | Profile, open SuccessProfiles                                               | PortfolioFit[]                                                                       | Job                 | SRC-07    |
| A10 | Match analysis                          | Analyze (1..N)                           | Approved profile, SuccessProfile, weights                                   | MatchAnalysis (criteria, evidence, gaps, to-confirm)                                 | Job for N > 1       | MAT-02    |
| A11 | Screening pre-fill                      | Pre-fill screening                       | Profile                                                                     | ScreeningDraft                                                                       | Sync                | SCR-03    |
| A12 | Outreach message                        | Draft message                            | Profile, SuccessProfile, channel, touch #, toggles, template                | OutreachDraft                                                                        | Sync (stream)       | OUT-01/02 |
| A13 | Call question list                      | Call questions                           | Profile, MatchAnalysis to-confirm items                                     | Question[]                                                                           | Sync                | QUA-01    |
| A14 | Notes → qualification                   | Structure notes                          | Raw notes                                                                   | QualificationRecord                                                                  | Sync                | QUA-03    |
| A15 | Tailored resume                         | Tailor resume                            | Original resume, approved profile, SuccessProfile                           | TailoredResume + fact-check report                                                   | Sync (stream)       | RES-01    |
| A16 | Submission report                       | Draft report                             | Profile, MatchAnalysis, Qualification, TailoredResume                       | SubmissionReport (sections 1–13)                                                     | Sync (stream)       | SUB-01    |
| A17 | Feedback structuring                    | Structure feedback                       | Pasted feedback text                                                        | Feedback                                                                             | Sync                | IVW-04    |
| A18 | Pattern summary                         | Summarize history                        | Past PipelineEntries, Feedback for client/role                              | PatternSummary with record links                                                     | Job                 | KNW-03    |
| X1  | Fact check (internal step)              | Runs inside A15/A16                      | Generated text, approved profile                                            | FactCheckWarning[]                                                                   | Inline              | AI-06     |
| X2  | Embeddings (internal)                   | On approval of profile / success profile | Approved text                                                               | vector                                                                               | Job                 | SRC-06/08 |

Note: X2 runs automatically after a recruiter approves something. It is indexing, not an AI decision, so it does not conflict with DP-2. Planning should confirm this reading with the product owner.

---

## 5. Proposed release slices

Goal: one complete recruiter loop early, built **multi-tenant from day one** (retrofitting tenancy is expensive and risky), then portals, then depth. Team of Wakers' internal use is tenant #1 (Q-29). To confirm with the product owner.

### Release 1: Multi-tenant core loop (intake → submission), internal use as tenant #1

- **E13 foundation**: tenant isolation, workspace creation by platform administrator, users/roles/defaults (US-1301…1303), AI usage metering and limits (US-1304)
- **E16 platform admin `/admin`**: access, agencies, platform admins, usage and budgets, audit log (US-1601…1605)
- E0 platform & AI framework (US-001…008)
- E1 intake/JD/success profile (US-101…107)
- E2 add candidate, duplicates, link to position, pool search, do-not-contact flag (US-201…204, 207, 208)
- E3 weights, match analysis, override, dashboard (US-301…304)
- E4 screening (US-401…402)
- E5 outreach drafts, sequence, reminders, **in-app email send via outbox with dev transport**, copy & mark sent for other channels (US-501…504)
- E6 call questions, notes structuring (US-601…602)
- E7 tailored resume; resume approval and per-client consent recorded by recruiter (US-701…702)
- E8 report, PDF, record submission (US-801…802)
- Minimal E9/E10 status tracking (US-901, US-1001)

Exit: a Team of Wakers recruiter (internal use) runs a real search intake → submission; isolation tests pass; AI eval set meets NFR-AI02/03.

### Release 2: Portals + through to start date (first external agencies)

- **E14 HM portal** (US-1401, 1402, 1404, 1405) and **E15 candidate portal** (US-1501…1503, 1505, 1507)
- E9 feedback (US-902…903), E10 reminders to start (US-1002)
- E11 KPI dashboard (US-1101…1102)
- **E13 commercial**: plans/billing via Billing Server, platform admin section (`/admin`), branding, tenant export (US-1305…1308)
- Real mail provider + reply sync (US-505)
- E16 system health and platform configuration in `/admin` (US-1606)
- E2 tags/notes, bulk upload, ATS/CSV import (FR-SRC-09 Should part, FR-SRC-10, Q-10)
- E3 stale analysis (US-305), E8 duplicate submission guard (US-803)
- Security: pen test, DPA/terms ready before first external customer

### Release 3: Talent pool intelligence, reuse, benchmarking

- E2 similar candidates, portfolio (US-205…206)
- E12 client history and pattern reports (US-1201…1202)
- E1 market benchmark with AI web search (US-108)
- Should/Could: HM intake online and interview slots (US-1403, 1406), candidate self-updates (US-1504), SMS, calendar, call transcripts
- Later, as a separate track: Korean UI and Korea data region (FR-TEN-08, PIPA), mobile app (Q-09)

---

## 6. KPI definitions (draft)

Computed from pipeline transition timestamps (§3). Confirm with recruiter lead.

| KPI                            | Formula                                                                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time-to-Fill                   | Days from position → SOURCING (or opened date) to ACCEPTED (offer accepted). Median per period                                                                                           |
| Time-to-Interview              | Days from SUBMITTED to first interview date, per pipeline entry. Median                                                                                                                  |
| Outreach Response Rate         | Entries with any response ÷ entries with ≥ 1 sent touch                                                                                                                                  |
| Candidate Conversion Rate      | Entries reaching stage N+1 ÷ entries reaching stage N (shown per stage)                                                                                                                  |
| Submission-to-Interview        | Entries with ≥ 1 interview ÷ entries SUBMITTED                                                                                                                                           |
| Interview-to-Offer             | Entries reaching OFFER ÷ entries with ≥ 1 interview                                                                                                                                      |
| Offer Acceptance Rate          | ACCEPTED ÷ OFFER                                                                                                                                                                         |
| Interview-to-Hire              | STARTED ÷ entries with ≥ 1 interview. "Hire" means the candidate started (brief §12: the recruiter's job runs to the start date). Time-to-Fill ends at ACCEPTED, the industry convention |
| Source-to-Hire                 | Per source: STARTED ÷ candidates added from that source                                                                                                                                  |
| Positions per recruiter (DP-5) | Count of positions in SOURCING…OFFER owned by recruiter, weekly average                                                                                                                  |
| Time per position (DP-5)       | Recruiter hours (time study) or system proxy (active days) per filled position                                                                                                           |
| Portal adoption                | Approvals, submission reviews and feedback done in portals ÷ all of them                                                                                                                 |

---

## 7. ADRs Planning should write

1. **Multi-tenancy model**: shared schema + `tenantId` + Postgres RLS (recommended) vs schema/DB per tenant; region-aware for Korea later
2. **Identity for external users**: HM and candidate sign-in via Account Server, magic links, or both (Q-23); per-agency candidate identity (Q-26)
3. **Portal architecture**: same Next.js app with separate route groups and narrow read APIs vs separate app
4. AI orchestration: direct LLM calls from worker vs Interactor agents/workflows; provenance storage
5. LLM model selection and routing by task (eval-driven); web search tool for benchmarking
6. Draft/approval versioning pattern for AI-touched artifacts and the shared Approval model
7. Match scoring method: LLM criterion scoring + deterministic weighted sum
8. Embedding model and pgvector indexing strategy (per-tenant filtering)
9. **Messaging**: outbox + transport interface; first real provider (agency OAuth mailboxes vs Team of Wakers sending domain)
10. Document parsing and OCR approach
11. PDF generation approach, with per-tenant branding
12. Access control model: tenant → client → ownership; portal audiences
13. **SaaS billing and metering** with Interactor Billing Server; per-tenant quotas
14. Use of other Interactor services (credentials, webhooks, SKB/UKB, userdb) (Q-19)
15. i18n: English first, Korean-ready
16. Audit log, data rights, tenant export/deletion
17. Mobile: portals mobile-web; native app later (Q-09)

---

## 8. Source of truth

`init.docx` remains the authoritative requirements source (rule in `CLAUDE.md`, "Source of Truth"). Planning must re-read it, cite the brief section each design element implements, and flag deviations. Only the product-owner decisions in [open-questions.md](./open-questions.md) override it. `CLAUDE.md` has been updated to the target stack (2026-10-06).
