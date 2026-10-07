# API Contracts (Draft)

| Field | Value |
|-------|-------|
| **Scope** | Release 1 endpoints in full; release 2 portal endpoints outlined |
| **Conventions** | [architecture.md §7](./architecture.md#7-api-design) (product-manager conventions) |
| **Schemas** | Request/response bodies are zod schemas in `packages/core/src/schemas/<module>.ts` (names below) |

Every route below is under `/api/v1/agencies/:agencyId` unless marked. `:agencyId` accepts the UUID or slug (product-manager `authorizeOrg` pattern). A caller who is not a member of the agency gets **404**, so other agencies' existence isn't revealed. Roles: **A** admin, **L** lead, **R** recruiter. "R+" means any agency role. **"owner"** means the owner of the position or pipeline entry, **or** a lead or admin of the agency (ADR-012).

Agency status: a suspended or closed agency answers **403 `agency_suspended`** on every agency route for its members (US-1602). Common responses: `200 { data }`, `201 { data }`, `202 { data: { jobRunId } }`, errors `{ error: { code, message, fields? } }`.

---

## 1. Tenancy & identity (E13, E0)

| Method | Path | Role | Body / query | Response | FR / US |
|--------|------|------|--------------|----------|---------|
| GET | `/api/v1/me` (no agency prefix) | any signed-in | — | `Me` (user, memberships via user-scoped policy, ADR-001) | PLT-01 |
| GET | `/members` | A, L | cursor | `Member[]` | TEN-03 |
| GET | `/invites` | A | — | `MemberInvite[]` (pending only: not accepted, revoked or expired) | TEN-02 |
| POST | `/invites` | A | `InviteMemberInput {email, role}` | `MemberInvite` · 409 `invite_already_pending` · 409 `already_member` | TEN-02 |
| DELETE | `/invites/:inviteId` | A | — | 204 · 404 if used, revoked or unknown | TEN-02 |
| POST | `/api/v1/invites/:agencySlug/accept` | signed-in (email must match) | `{token}` | `Membership` · 410 `invite_expired` | TEN-02 |
| PATCH | `/members/:userId` | A | `{role?, active?}` | `Member` · 409 `last_admin` (an agency keeps at least one active admin) | TEN-03 |
| GET / PATCH | `/settings` | A (PATCH), R+ (GET) | `AgencySettingsInput` (default weights, outreach intervals, guard modes, rejection reasons) | `AgencySettings` | TEN-03 |
| GET | `/usage` | A | `?month=` | `UsageSummary` (AI cost by purpose, limit) | TEN-05, US-1304 |
| POST | `/support-grants` (**release 2**) | A | `{adminId, reason, hours ≤ 72}` (approves a request from a platform administrator) | `SupportGrant` | TEN-07, US-1305 |

## 1a. Platform admin: `/api/admin/v1` (E16)

Audience `admin`; requires `User.platformRole`. Roles: **O** owner, **Ad** admin, **S** support (read-only). Non-platform users get 404.

| Method | Path | Role | Body / query | Response | FR / US |
|--------|------|------|--------------|----------|---------|
| GET | `/api/admin/v1/agencies` | O, Ad, S | `?q=&status=&cursor=` | `AgencySummary[]` (status, region, plan, members, MTD AI cost) | ADM-02, US-1602 |
| POST | `/api/admin/v1/agencies` | O, Ad | `CreateAgencyInput {name, slug, adminEmail, region}` | `Agency` + first admin invite · 409 `slug_taken` | ADM-02, TEN-02 |
| GET | `/api/admin/v1/agencies/:id` | O, Ad, S | — | `AgencyDetail` (metadata and usage only) | ADM-02 |
| POST | `/api/admin/v1/agencies/:id/suspend` · `/reactivate` | O, Ad | `{reason}` | `Agency` | ADM-03, US-1602 |
| PATCH | `/api/admin/v1/agencies/:id/budget` | O, Ad | `{aiMonthlyBudgetUsd}` | `Agency` | ADM-05, US-1604 |
| GET | `/api/admin/v1/usage` | O, Ad, S | `?from=&to=&agencyId=&groupBy=agency\|purpose\|model\|day` | `UsageRow[]` from `LlmCall` | ADM-05, US-1604 |
| GET / POST / PATCH / DELETE | `/api/admin/v1/admins[/:userId]` | O | `{email, role}` / `{role}` | `PlatformAdmin` · 409 `last_owner` | ADM-04, US-1603 |
| GET | `/api/admin/v1/audit` | O, Ad, S | `?adminId=&agencyId=&action=&cursor=` | `PlatformAuditEntry[]` | ADM-06, US-1605 |
| POST | `/api/admin/v1/agencies/:id/support-grants` (**release 2**) | O, Ad, S | `{reason, hours ≤ 72}` | `SupportGrantRequest` (pending agency approval) | ADM-07, US-1305 |

## 2. Clients & positions: brief §3 (E1)

| Method | Path | Role | Body | Response | FR / US |
|--------|------|------|------|----------|---------|
| GET / POST | `/clients` | R+ | `ClientInput {name}` | `Client` | INT-01, US-101 |
| POST | `/clients/:id/contacts` | R+ | `ContactInput {name, title?, email?, phone?}` | `Contact` | INT-01 |
| GET / POST | `/positions` | R+ | `PositionInput` (§3.1 fields: title, location, clientId required) | `Position` · 422 per field | INT-02, US-102 |
| PATCH | `/positions/:id` | owner/L/A | partial `PositionInput` | `Position` | INT-02 |
| POST | `/positions/:id/jd` | owner | multipart file **or** `{text}` | `JobDescription(kind=original)` | INT-03 |
| POST | `/positions/:id/jd/structure` | owner | — | stream → `ArtifactVersion<StructuredJD>` (draft) · 422 `unreadable_document` · 402 `budget_exceeded` | INT-04/05, US-103 |
| POST | `/positions/:id/intake-questions` | owner | — | `ArtifactVersion<IntakeQuestions>` | INT-06, US-104 |
| PUT | `/positions/:id/intake` | owner | `IntakeAnswersInput` (§3.4, 10 topics) | `IntakeRecord` | INT-09, US-106 |
| POST | `/positions/:id/jd-approval` | owner | `RecordApprovalInput {decision, approverName, method, decidedAt, comments?}` | `Approval` | INT-10, US-106 |
| POST | `/positions/:id/success-profile` | owner | — | `ArtifactVersion<SuccessProfile>` (draft) · 409 `guard_failed` if JD not approved | INT-11, US-107 |
| POST | `/positions/:id/jd/export` | owner | `{format: docx \| pdf}` | `202 jobRunId` → file | INT-08, US-105 |
| PUT | `/positions/:id/matching-weights` | owner | `MatchingWeights` (7 keys, sum 100) · 422 `weights_sum` | `Position` | MAT-01, US-301 |
| POST | `/positions/:id/search-criteria` | owner | — | `ArtifactVersion<SearchCriteria>` | SRC-01, US-201 |

## 3. Artifacts (shared draft → approve lifecycle, ADR-006)

| Method | Path | Role | Body | Response | FR / US |
|--------|------|------|------|----------|---------|
| GET | `/artifacts/:id` | R+ (with access to subject) | `?versions=true` | `Artifact` + versions | AI-02/04 |
| POST | `/artifacts/:id/versions` | R+ | `{content}` (validated by kind schema; human edit) | `ArtifactVersion(origin=ai_edited\|human)` | AI-04 |
| POST | `/artifacts/:id/versions/:vid/approve` | R+ | `{factCheckResolutions?}` | `Artifact(approvedVersionId)` · 409 `factcheck_unresolved` · 409 `missing_recruiter_assessment` | AI-02/06, US-003/005 |
| POST | `/artifacts/:id/versions/:vid/discard` | R+ | — | `ArtifactVersion` | AI-02 |
| GET | `/ai-generations/:id` | A | — | provenance (`AiGeneration` + `LlmCall`) | AI-03, US-004 |

## 4. Candidates & pool: brief §4 (E2)

| Method | Path | Role | Body | Response | FR / US |
|--------|------|------|------|----------|---------|
| POST | `/candidates/intake` | R+ | multipart resume **or** `{profileText}` + `{source, profileUrl?}` | `202 jobRunId` → `CandidateDraft {duplicates[], profileDraft}` | SRC-02/03, US-202 |
| POST | `/candidates` | R+ | `ConfirmCandidateInput {draftId, resolution: create\|merge\|link, reason?}` | `Candidate` · 409 `possible_duplicate` without resolution | SRC-04, US-203 |
| GET | `/candidates` | R+ | `?q=&skills=&location=&seniority=&tags=&cursor=` | `CandidateSummary[]` (p95 < 2 s) | SRC-08, US-207 |
| GET | `/search` | R+ | `?q=` | `{clients[], positions[], candidates[]}` | PLT-06 |
| PATCH | `/candidates/:id/do-not-contact` | R+ (set), A (clear) | `{value, reason}` | `Candidate` | SRC-09, US-208 |
| POST | `/positions/:id/pipeline` | R+ | `{candidateIds[]}` | `PipelineEntry[]` (state `sourced`) · 409 if already present | SRC-05, US-204 |
| GET | `/candidates/:id/files/:fileId` | R+ | — | 302 to short-lived authorized URL | PLT-05 |

## 5. Pipeline, matching, screening: brief §5–6 (E3, E4)

| Method | Path | Role | Body | Response | FR / US |
|--------|------|------|------|----------|---------|
| GET | `/positions/:id/dashboard` | R+ | `?state=&class=&sort=suggested\|manual` | `DashboardRow[]` (§5.3 columns) | MAT-06, US-304 |
| PUT | `/positions/:id/dashboard/order` | owner | `{entryIds[]}` | 204 | MAT-06 |
| POST | `/positions/:id/match-analyses` | owner | `{entryIds[]}` (1–50) | 1: stream; >1: `202 jobRunId` | MAT-02/03, US-302 |
| POST | `/match-analyses/:id/review` | owner | `{versionId}`: Mark reviewed (approves the analysis artifact; ADR-006) | `MatchAnalysis` | MAT-02, ADR-006 |
| PATCH | `/match-analyses/:id/override` | owner | `{overallScore?, criterion?: {key, score}, reason}` | `MatchAnalysis` | MAT-04, US-303 |
| PUT | `/match-analyses/:id/assessment` | owner | `{recruiterAssessment}` (human text only) | `MatchAnalysis` | MAT-05 |
| PUT | `/pipeline/:entryId/screening` | owner | `ScreeningInput` (§6, 14 items) | `ScreeningAssessment` | SCR-01, US-401 |
| POST | `/pipeline/:entryId/transitions` | owner/L | `{to, reason?, overrideGuards?: [{guard, reason}]}` | `PipelineEntry` · 409 `guard_failed {guards[]}` | handoff §3, US-402 |

## 6. Outreach & messaging: brief §7 (E5)

| Method | Path | Role | Body | Response | FR / US |
|--------|------|------|------|----------|---------|
| PUT | `/pipeline/:entryId/sequence` | owner | `{channel, intervalsDays: [n, n]}` | `OutreachTouch[]` | OUT-02, US-502 |
| POST | `/pipeline/:entryId/touches/:n/draft` | owner | `{include: {compensation, location, …}, templateId? (release 2, FR-OUT-06)}` | stream → `ArtifactVersion<OutreachMessage>` · 409 `do_not_contact` | OUT-01, US-501 |
| POST | `/pipeline/:entryId/touches/:n/send` | owner | `{versionId}` (approved) | `OutboxMessage` (email) · 409 `suppressed` · 409 `not_approved` | OUT-03, MSG-01, US-504 |
| POST | `/pipeline/:entryId/touches/:n/mark-sent` | owner | `{versionId}` (LinkedIn, text, phone) | `OutreachTouch` | OUT-03, US-503 |
| POST | `/pipeline/:entryId/response` | owner | `{response}` | `OutreachTouch` (remaining touches cancelled on reply) | OUT-04/05 |
| GET | `/outbox` | A | `?status=` | `OutboxMessage[]` (dev-capture inbox in test mode) | MSG-02 |
| GET | `/api/public/unsubscribe/:token` (public) | — | — | confirmation page; creates `Suppression` | MSG-05 |

## 7. Qualification, resume, submission: brief §8–10 (E6–E8)

| Method | Path | Role | Body | Response | FR / US |
|--------|------|------|------|----------|---------|
| POST | `/pipeline/:entryId/call-questions` | owner | — | `ArtifactVersion<CallQuestions>` | QUA-01, US-601 |
| POST | `/pipeline/:entryId/qualification/structure` | owner | `{notes}` | `ArtifactVersion<Qualification>` (draft) | QUA-02/03, US-602 |
| POST | `/pipeline/:entryId/tailored-resume` | owner | `{blind: boolean}` | stream → `ArtifactVersion<TailoredResume>` + `factCheck[]` | RES-01/02, US-701 |
| POST | `/pipeline/:entryId/approvals` | owner | `RecordApprovalInput` (subject `tailored_resume`) | `Approval` | RES-03, US-702 |
| POST | `/candidates/:id/consents` | owner | `{clientId, action: given\|withdrawn, at, method}` (append-only rows) | `Consent` | CDP-03, US-702 |
| POST | `/pipeline/:entryId/submission-report` | owner | — | stream → `ArtifactVersion<SubmissionReport>` (sections 1–13; 14 empty) + `missingInputs[]` | SUB-01, US-801 |
| POST | `/pipeline/:entryId/submission-report/pdf` | owner | `{versionId}` | `202 jobRunId` → `FileObject` | SUB-02, US-802 |
| POST | `/pipeline/:entryId/submissions` | owner | `{reportVersionId, tailoredResumeId, toContactId, method, submittedAt}` | `Submission` + entry → `submitted` · 409 `guard_failed` | SUB-03, US-802 |

## 8. Interviews, offers, tasks (release 1 minimal)

| Method | Path | Role | Body | Response | FR / US |
|--------|------|------|------|----------|---------|
| POST / PATCH | `/pipeline/:entryId/interviews[/:id]` | owner | `InterviewInput {roundName, scheduledAt, format, interviewers[], status}` | `Interview` | IVW-01/02, US-901 |
| PUT | `/pipeline/:entryId/offer` | owner | `OfferInput` (§12, 9 milestones, outcome) | `Offer` | OFF-01/03, US-1001 |
| GET | `/tasks` | R+ | `?due=today\|overdue` | `Task[]` | PLT-04, US-006 |
| PATCH | `/tasks/:id` | owner | `{completed?, snoozeUntil?}` | `Task` | PLT-04 |
| GET | `/activity` | R+ | `?entityType=&entityId=&cursor=` | `ActivityLog[]` | PLT-03, US-007 |
| POST | `/candidates/:id/export` · `DELETE /candidates/:id` | A | `{reason}` | `202 jobRunId` | PLT-08, US-008 |

## 9. Realtime

| Path | Channels | Access check |
|------|----------|--------------|
| `GET /api/sse/[channel]` | `user:<id>`, `job:<jobRunId>`, `agency:<id>:position:<id>` | Channel agency must match a membership of the caller; job must belong to the caller's agency |

---

## 10. Portal API (release 2 outline): `/api/portal/v1/:agencySlug`

Authenticated by portal session (magic link, ADR-002). Reads only `PortalShare` snapshots (ADR-003).

| Method | Path | Audience | Purpose | FR |
|--------|------|----------|---------|----|
| POST | `/api/portal/v1/:agencySlug/magic-link/redeem` | — | Exchange token for session (single-use, expiring) | HMP-01, CDP-01 |
| GET | `/shares` | HM, candidate | List what's shared with me | HMP-04, CDP-05 |
| POST | `/shares/:id/approve` · `/request-changes` | HM (JD), candidate (resume) | Approval with comments | HMP-02, CDP-02 |
| PUT | `/shares/:id/intake` | HM | Intake answers (source `hm_portal`) | HMP-03 |
| POST | `/shares/:id/decision` | HM | Creates `ProposedTransition` (recruiter confirms) | HMP-05 |
| POST | `/shares/:id/feedback` | HM | Structured interview feedback | HMP-05, IVW-03 |
| POST | `/consents` | candidate | `{clientId, action: given\|withdrawn}`: give or withdraw consent per client (new row each time) | CDP-03 |
| POST | `/privacy-requests` | candidate | Export / delete request | CDP-06 |

Recruiter-side portal management (release 2, agency API): `POST /portal-users` (invite), `POST /portal-shares`, `DELETE /portal-shares/:id`, `POST /proposed-transitions/:id/resolve`.
