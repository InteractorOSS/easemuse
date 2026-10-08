# Penetration test: what to hand the tester

**Draft 2026-10-07.** The product owner arranges the test (T-SEC-01, risk TR-001, TR-005). It has to be finished, and its findings fixed, before the first external agency goes live. This page is the pack to give the tester and the list of things to ask for back. Nothing here needs to be built first, except the items marked **to prepare**.

## 1. Scope

| In scope | Out of scope |
|----------|--------------|
| The EaseMuse web app and API: the workbench (`/a/<agency>`), the platform admin area (`/admin`, `/api/admin/v1`), the hiring-manager portal (`/h/<agency>`), the candidate portal (`/c/<agency>`), the public routes (`/api/public/...`: unsubscribe, portal redeem and re-login, agency logo), the print routes (`/render/...`) and the worker. | The Interactor Account Server, Billing Server and other Interactor services; Anthropic, Voyage AI and the hosting provider's own platform; denial-of-service and volumetric tests; social engineering of staff. |

Environment **(to prepare)**: a staging copy with production configuration and its own database, the Interactor sign-in pointed at a test organisation, S3-compatible storage, and `AI` calls either to a stub or to the real model with a small budget (say which). Synthetic data only: no real candidate or client data may be in the test environment. Rate limits stay on; give the tester's source addresses so they are not blocked by mistake.

## 2. Accounts to create **(to prepare)**

| Account | Purpose |
|---------|---------|
| Agency A: admin, lead, recruiter | The main test subject |
| Agency B: admin, recruiter | The "other tenant" for every cross-tenant attempt |
| Platform owner, platform admin, platform support (with MFA) | `/admin` and the role split |
| A suspended agency C | Behaviour of a suspended workspace |
| Hiring manager and candidate portal users in A and in B | Portal leakage and link handling |
| A pending, an approved and an expired support grant on A | Support-access bypass attempts |

Each agency holds the same shape of data (a client, a position with an approved job description, candidates in several pipeline stages, an approved resume and report, a submission, an interview, an offer, an outbox message, files). Run the seed so both tenants look alike, and keep a list of record ids per tenant to give the tester.

## 3. Documents to hand over (all in the repository)

| Document | Why |
|----------|-----|
| `docs/planning/architecture.md` and ADR-001 (multi-tenancy and isolation), ADR-002 (identity), ADR-003 (portals), ADR-012 (access control and support access), ADR-016 (audit and data rights) | How isolation, identity and access are meant to work |
| `docs/planning/risks.md` (TR-001, TR-005, TR-007) and `docs/planning/spikes/tr-007-rls-pooling.md` | What we already worry about |
| `docs/planning/api-contracts.md` and the route list | Every endpoint, its audience and its role rule |
| `apps/web/src/app/api/permission-matrix.test.ts` and the isolation tests (`src/server/isolation*.db.test.ts`) | What is already tested; ask the tester to look for what these miss |
| `docs/planning/implementation-notes.md` | Decisions that affect security (support access, deletion, branding) |
| `docs/legal/data-processing-agreement.md` Annex II | The claims we make to customers; ask the tester to try to falsify them |

Offer **grey-box** access: source code read access and a read-only database account on staging. It finds more per euro than black-box.

## 4. Where to look hardest

1. **Tenant isolation.** Another agency's records through every route that takes an id (the permission matrix lists them); through search, the activity timeline, the jobs and SSE channels (`job:<id>`), file downloads, the export and deletion routes, the logo route, and the Server-Sent Events. Row-level security bypass: the `app.agency_id` setting under connection pooling, raw SQL, a route that forgets the scoped client. Expected answer for another tenant's id: 404.
2. **Authorisation inside a tenant.** Recruiter versus lead versus admin; ownership rules; client-confidential fields (compensation, hiring-manager feedback, assessments) for a recruiter without access to the position.
3. **Support access** (new). Reaching a workspace without an active grant; using a grant after it expires or is revoked; writing under a read-only grant (the proxy stamps the real method; try method override headers, `x-easemuse-method` and `x-easemuse-path` supplied by the client, HEAD/GET with side effects, Server Actions, route handlers that write on GET); suppressing or forging the log entries; a platform `support` role asking for a grant on behalf of someone else.
4. **Portals.** Anything beyond the published snapshot: scores, unsubmitted candidates, recruiter notes, another candidate's data, another agency's share ids. Magic-link reuse, brute force, token leakage through referrers or logs, session fixation, the re-login endpoint as an email oracle.
5. **Authentication.** Auth.js callbacks, open redirects, MFA enforcement and downgrade, session lifetime, the platform-invite and member-invite acceptance, invite token handling.
6. **Files and documents.** Malicious PDFs, DOCX (zip bombs, XXE, macros), polyglots, huge pages; content-type spoofing (types are read from bytes); the logo upload (PNG and JPEG only; try SVG, polyglots, decompression bombs, oversize dimensions) and the public logo route; the print route and its signed token (forging, replaying, using it for another version or agency); SSRF through the headless browser that prints PDFs.
7. **AI surface.** Prompt injection in resumes, job descriptions and notes aiming to leak other data, change a draft's status, skip the approval or fact check, or produce markup that is rendered unsafely; budget exhaustion; the AI draft approval gate (drafts must never feed later steps).
8. **Email and outreach.** Header injection in subject and addresses, unsubscribe token forgery, sending to suppressed addresses, the outbox view.
9. **Data rights.** Candidate export and anonymisation, tenant export (what the ZIP contains, whether another tenant's data can enter it, path handling in file names), tenant deletion (can a single admin trigger it? can the typed-name check be skipped? can a non-suspended tenant be deleted? can the second approver be the first?).
10. **Platform admin.** Role boundaries (`owner`, `admin`, `support`), the audit log write path, the Anthropic key setting (stored encrypted; check it is never returned), feature flags and defaults.
11. **Transport and headers.** TLS configuration, security headers, CORS, cookie flags, caching of authenticated responses, error messages that leak internals.
12. **Secrets and logs.** Anything sensitive in logs, error pages or client bundles; secrets scanning on the repository history.

## 5. Rules of engagement

Test only the staging environment and the accounts above. Stop and tell us at once about any finding that exposes real third-party data or that could affect other customers. No persistence beyond the test; no data exfiltration beyond proof. Name a technical contact on our side for the test window **(to prepare)**, and tell the tester how to reset the environment.

## 6. What to ask for back

1. A report with an executive summary, scope and method, each finding with severity (CVSS or similar), evidence to reproduce, impact and a recommended fix, and a list of what was tested and found clean.
2. A separate **customer-shareable summary** (no exploit detail) that we can give agencies under the DPA (section 10).
3. A **retest** of every high and critical finding after we fix it, with written confirmation.
4. The tester's statement of independence and the dates.

## 7. Release gate

The first external agency goes live only when: no open critical or high finding; every medium has a fix date the product owner accepted; the retest letter is in hand; the isolation and permission tests pass in CI; and the DPA, terms and sub-processor list are signed off by counsel.
