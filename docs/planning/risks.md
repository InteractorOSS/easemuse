# Risk Register

| Field | Value |
|-------|-------|
| **Project** | EaseMuse AI-Assisted Recruiter Workbench |
| **Assessment date** | 2026-10-06 |
| **Review** | At each release-slice boundary and whenever an ADR changes |
| **Sources** | `init.docx` (brief), [discovery research notes §4](../discovery/research-notes.md#4-risks-surfaced-during-discovery) (R1–R14), planning analysis |

Scoring: Probability (L/M/H) × Impact (L/M/H/Critical) → Score. Discovery IDs are kept in brackets for traceability.

---

## Risk matrix

```
              IMPACT →   Low        Medium              High                    Critical
PROBABILITY
High                                 TR-004 [R7]         BR-001 [R6]
Medium                   TR-006      TR-003, TR-007,     TR-002 [R2], BR-002,
                         [R10]       ER-003 [R4]         BR-003 [R14], ER-001 [R1],
                                     TR-008, TR-009      ER-002 [R13], TR-005 [R12],
                                                         TR-010, BR-004
Low                                  ER-004 [R8]                                    TR-001 [R11]
Later                                ER-005 [R9]
```

---

## Technical risks

| ID | Risk | Prob. | Impact | Score | Status | Brief / req. |
|----|------|-------|--------|-------|--------|--------------|
| TR-001 [R11] | Cross-tenant data leak | L | Critical | High | Open | FR-TEN-01 |
| TR-002 [R2] | AI invents or inflates candidate facts in tailored resumes or reports | M | High | High | Open | §9.1, FR-AI-06 |
| TR-003 [R5] | AI cost per position exceeds plan pricing | M | Medium | Medium | Open | FR-AI-08, FR-TEN-05 |
| TR-004 | No real evaluation data (JDs, resumes) early enough to tune prompts and choose models | H | Medium | High | Open | NFR-AI01, Q-18 |
| TR-005 [R12] | Portal users see data they shouldn't (scores, other candidates, recruiter notes) | M | High | High | Open | FR-HMP-04 |
| TR-006 [R10] | Poor source documents (scanned PDFs, sparse profiles) give weak structuring | M | Low | Low | Partly mitigated (spike T-F-23, 2026-10-07: [result](./spikes/tf-23-extraction-quality.md); real resumes and the live fallback still to measure) | §4.2 |
| TR-007 | Postgres RLS and Prisma connection pooling interact badly (tenant context leaking across pooled connections) | M | Medium | Medium | Mitigated (spike T-F-07, 2026-10-06: [result](./spikes/tr-007-rls-pooling.md)) | ADR-001 |
| TR-008 | Interactor Account Server can't model invite-only external users (HMs, candidates) per tenant | L | Medium | Low | Mitigated by ADR-002 (app-local magic links), pending Q-32 | ADR-002, Q-23 |
| TR-009 | LLM latency makes streaming drafts feel slow (> 45 s for long reports) | M | Medium | Medium | Open | NFR-P04 |
| TR-010 | Match score unstable between runs (same input, different score), undermining trust | M | High | High | Open | §5.2, ADR-007 |
| TR-011 | Account Server may not emit `amr`/`acr` claims, so MFA for agency users and platform admins cannot be verified or enforced (found in T-F-24) | M | Medium | Medium | Open | FR-PLT-01, NFR-S01, ADR-002 |

## Business risks

| ID | Risk | Prob. | Impact | Score | Status |
|----|------|-------|--------|-------|--------|
| BR-001 [R6] | Scope: 12 brief systems + tenancy + 2 portals + messaging | H | High | Critical | Open |
| BR-002 [R3] | Recruiters don't adopt (extra entry, low trust in drafts) | M | High | High | Open |
| BR-003 [R14] | Agencies won't switch from their current ATS | M | High | High | Open |
| BR-004 [R7] | No baselines, so capacity gains (brief §1.1 performance metric) can't be shown | H | Medium | High | Open |

## External risks

| ID | Risk | Prob. | Impact | Score | Status |
|----|------|-------|--------|-------|--------|
| ER-001 [R1] | Match scoring treated as an automated employment decision tool (NYC LL144, Colorado, Illinois, California) | M | High | High | Open |
| ER-002 [R13] | Liability as an AI-in-hiring vendor to agencies | M | High | High | Open |
| ER-003 [R4] | Web-search benchmarks thin or inaccurate | M | Medium | Medium | Accepted (cited, optional, release 3) |
| ER-004 [R8] | Mail provider integration delayed (OAuth review, deliverability) | L | Medium | Low | Mitigated by design (outbox + dev transport) |
| ER-005 [R9] | Korea expansion requires a separate region and PIPA work | Later | Medium | Low | Monitoring |

---

## Mitigations and contingencies (High and Critical)

| ID | Mitigation (planned work) | Trigger to escalate | Contingency |
|----|--------------------------|---------------------|-------------|
| TR-001 | Defense in depth: tenant-scoped Prisma client **and** Postgres RLS (ADR-001); tenant context in every job and SSE channel; cross-tenant test suite on every endpoint in CI; pen test before first external agency | Any isolation test failure, or any query path found without tenant scope | Block release; incident process; notify affected tenants per DPA |
| TR-002 | Fact-check step (X1) compares names, employers, titles, dates and numbers against the approved profile; approval blocked until warnings are resolved; eval set with zero-invention target (NFR-AI03) | Any invented fact on the eval set | Restrict tailoring to reordering and selecting existing bullets only (no rewriting) until fixed |
| TR-004 | Public JDs collected (eval-data/); resumes per Q-18 decision; anonymize; build eval harness before the first AI feature | Data not received by end of sprint 1 | Use synthetic resumes built from public JDs for early tuning; delay the AI quality gate, not the build |
| TR-005 | Separate portal API with its own narrow read models (ADR-003); permission tests per audience; HM portal never queries recruiter tables directly | Any portal test returning a non-shared field | Disable portal access for the affected record type |
| TR-010 | Criterion-level scoring with evidence on an anchored rubric, fixed prompt version and fixed criterion order (sampling parameters aren't adjustable on Opus 5.5); overall score computed in code (ADR-007); store inputs; regression test on fixed pairs | Score variance > 5 points on repeated runs in eval | Show criterion levels (Strong/Partial/Gap) only and hide the numeric score (Q-06 option) |
| TR-011 | MFA detection from OIDC claims is built (`lib/auth/mfa.ts`) and staged by `MFA_ENFORCEMENT` = off, log (default) or enforce. Confirm with the Account Server owners which claims a second-factor sign-in carries, check the `log` output for `mfa.missing`, then switch to `enforce` | `mfa.missing` logged for users known to have MFA | Stay on `log`, require MFA at the Account Server instead, and note the gap for customers |
| BR-001 | Release slices (release 1 = multi-tenant core loop only); walking skeleton first; tasks < 1 day; scope changes go through `/handle-change` | Release 1 tasks exceed capacity by > 20% | Cut low-risk release 1 items first: explain-only mode (T-3-10), usage page (T-13-05), merge (T-2-06, keep link-only); then defer US-504 to copy-and-mark-sent |
| BR-002 | Team of Wakers' internal recruiters as the first users from release 1; measure draft edit rate (T-AI-14); replace their spreadsheet fully | Edit rate on drafts > 60%, or pilot users keep spreadsheets after 4 weeks | Prioritize draft-quality work over new features |
| BR-003 | CSV and ATS import (release 2); design partners (Q-30) | No design partner by release 1 end | Position release 2 for boutique agencies like the pilot only |
| BR-004 | Baseline time study during release 1 build | Not started by release 1 mid-point | Use system timestamps from the pilot as a weaker baseline |
| ER-001 / ER-002 | Counsel review before first external agency; bias test (NFR-AI04); provenance and override logs; option to hide numeric score per tenant; DPA and terms | Counsel says scoring is in scope of an AEDT law for target customers | Ship "explain-only" mode (no numeric score) for affected tenants; commission bias audit |

---

## Planning-phase actions

| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | Request eval data (Q-18) | Product owner | Start of release 1 |
| 2 | Product owner accepts ADR-002 (portal users without Account Server accounts, Q-32) | Product owner | Before release 2 |
| 3 | Spike: RLS + Prisma pg adapter + pooled connections (TR-007) | Tech lead | Sprint 1 |
| 4 | Counsel review of match scoring and vendor role (ER-001/002) | Product owner | Before release 2 |
| 5 | Start baseline time study (BR-004) | Recruiter lead | During release 1 |
