# Step 4: Requirements Document

| Field | Value |
|-------|-------|
| **Project** | EaseMuse AI-Assisted Recruiter Workbench |
| **Version** | 0.2 (SaaS, portals, messaging; 2026-10-06) |
| **Last updated** | 2026-10-06 |
| **Source** | `init.docx` §1–17 (section numbers below refer to the brief) |
| **Status** | Draft. Priorities are **proposed** (MoSCoW) and need product owner confirmation |

Requirement language: **must** = mandatory; **may** = optional. Items marked ⚠ depend on an open question in [open-questions.md](./open-questions.md).

---

## 1. Executive summary

Team of Wakers will build EaseMuse and **sell it to recruiting agencies (multi-tenant SaaS)** one web system that supports a recruiter through every step of a client search: intake, JD analysis, sourcing and talent pool, matching analysis, screening, outreach, qualification, resume preparation, submission, interview and feedback, offer and closing, analytics, and reuse of past experience. Hiring managers and candidates take part through their own **portals**. AI drafts and organizes on request; the recruiter decides and approves everything. The product succeeds if recruiters can run more positions in less time without losing submission quality.

See [01-problem-statement.md](./01-problem-statement.md) for the problem, goals, metrics and design principles DP-1…DP-6.

---

## 2. Scope

### In scope
- **Multi-tenant SaaS**: agency sign-up/onboarding, per-agency isolation, agency admin, plans and billing, branding (decision 2026-10-06)
- **Hiring manager portal**: JD approval, intake answers, submission review, interview feedback, decisions
- **Candidate portal**: resume approval, profile updates, consent and privacy requests, submission status
- **In-app messaging**: compose and send outreach email from the app through an outbox; pluggable transport (no real mail provider connected yet)
- Client and position management, JD structuring and enhancement, hiring manager intake, Candidate Success Profile (§3)
- Recruiter-entered candidates: resume/profile upload, structured profile, duplicate detection, talent pool, multi-position fit view (§4)
- Explainable match analysis with adjustable weights, review dashboard (§5)
- Recruiter screening and classification (§6)
- Outreach drafting, multi-touch sequences, reminders, activity log (§7)
- Qualification call support (§8)
- Tailored resume drafts and candidate approval tracking (§9)
- Candidate Submission Report with PDF export (§10)
- Interview, feedback, offer and closing tracking (§11–12)
- Recruiting KPIs and source analysis (§13)
- Searchable history of outcomes and feedback (§14)

### Out of scope (explicit)
- **Automated candidate search, scraping or crawling** of LinkedIn or any external site (§4.1)
- **AI acting on its own**: no automatic sending, auto-reject, auto-advance, or scheduled AI runs without a recruiter request (DP-2)
- **Automatic filtering by score** (§5.3)
- AI that "learns by itself" to make decisions (§14). Reuse is about recording and finding, not autonomous learning
- Changing facts in a candidate's resume (§9.1)
- Payroll, onboarding execution, background checks (the system only *tracks* pre-employment and onboarding status, §12)
- Agencies invoicing *their* clients for placement fees (⚠ Q-13). Billing agencies for the SaaS **is** in scope (FR-TEN-05)
- Connecting a production mail provider and reply sync in the first release (transport is pluggable; provider chosen later)
- Paid market-data sources (benchmarking uses AI web search only)
- Sharing candidates or talent pools between agencies (decided: never, Q-22)
- Native mobile app in release 1 (⚠ Q-09). Portals must work well in a phone browser instead

### Assumptions
See [01-problem-statement.md §8](./01-problem-statement.md#8-assumptions-to-validate) (A1–A7).

### Constraints
| ID | Constraint |
|----|-----------|
| C1 | Design principles DP-1…DP-6 apply to every feature |
| C2 | Candidate data is personal data. **U.S. first** (federal + state privacy and AI-in-hiring rules); design must not block **Korea** later (PIPA, data region, Korean UI) |
| C3 | Team of Wakers (owner and maintainer of EaseMuse) is a **vendor/processor** to agencies: per-tenant isolation, DPA, sub-processor list, tenant data export at contract end |
| C4 | No automation against LinkedIn (its terms prohibit scraping and automated messaging) |
| C5 | Target stack (given by product owner 2026-10-06, same as Interactor product-manager): pnpm/Turborepo monorepo, Node 24, TypeScript 6; Next.js 16 App Router + React 19.2, Tailwind 4, Radix, TanStack Query, react-hook-form + zod 4, next-intl; Next.js route handlers for API; BullMQ + Redis worker; SSE via Postgres LISTEN/NOTIFY; PostgreSQL 16 + pgvector (CNPG), Prisma 7.8; Interactor Account Server (Auth.js v5) and other Interactor services; Expo 56 for mobile; Vitest, Playwright + axe. Infrastructure is out of scope for discovery (per product owner). See [research-notes.md §2](./research-notes.md#2-technical-feasibility). |
| C6 | AI provider must offer terms that do not train on customer data and allow the required data residency |

---

## 3. Cross-cutting requirements

These apply to every system below. Planning should design them once, as shared platform pieces.

### 3.1 AI assistance framework (from §1.1, §15②)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-AI-01 | Must | AI runs only on an explicit recruiter action (button or command). **Single exception:** computing embeddings (search indexes) of content a recruiter has just approved. This produces no visible output and makes no decision (planning-handoff X2). | No generative AI call happens without a user-initiated request record; the only automatic AI work is embedding approved content. |
| FR-AI-02 | Must | Every AI output is stored as a **draft** with states: `draft → edited → approved` (or `discarded`). Only approved content is used downstream (reports, PDFs, profiles, messages). | Downstream features read approved versions only; drafts are visually marked "AI draft". |
| FR-AI-03 | Must | Provenance: each AI output records the requester, time, model/version, prompt template version, and the input records it used. | Admin can view provenance for any AI output. |
| FR-AI-04 | Must | Recruiter edits are kept as a diff/version against the AI draft. | Version history shows AI original and each edit. |
| FR-AI-05 | Must | AI outputs that make claims about a candidate must cite where in the source (resume, notes) the claim comes from, or be labelled as inference ("Potential motivation", "Potential concerns"). | Each strength/gap in match analysis links to evidence or is flagged as inferred. |
| FR-AI-06 | Must | AI never invents facts (employers, dates, titles, numbers) about candidates. Generated documents are checked against the structured profile before approval. | Tailored resume and report drafts show a warning for any fact not found in the source. |
| FR-AI-07 | Should | AI requests show progress and can be cancelled; failures show a clear error and leave existing data unchanged. | Timeouts and provider errors do not corrupt records. |
| FR-AI-08 | Should | Per-request AI cost and token usage is recorded. | Cost report per recruiter and per position. |
| FR-AI-09 | Must | AI must not use protected characteristics (age, gender, race, nationality, religion, disability, marital status, photos, etc.) as matching or ranking inputs; these fields must be removed from matching and ranking inputs (structured fields excluded; photos and date-of-birth removed from resume content before analysis). | Matching prompts and features exclude these fields; bias test set passes (NFR-AI04). |

### 3.2 Platform

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-PLT-01 | Must | Sign-in through Interactor Account Server (Auth.js v5). User types: **platform administrator** (Team of Wakers), **agency admin**, **recruiter** (optionally **lead**), **hiring manager** (portal), **candidate** (portal). External users (HMs, candidates) sign in by recruiter-issued invite / magic link backed by Account Server (decided, Q-23). | Each user type signs in and lands on its own view (workbench, platform admin section (`/admin`), HM portal, candidate portal); MFA enforced for agency admins and recruiters. |
| FR-PLT-02 | Must | Access control in three layers: (1) **tenant**: no data crosses agencies; (2) **client** within an agency: an HM sees only their client's positions and the candidates submitted to them; (3) **ownership/team** among recruiters (configurable per agency). Candidates see only their own data. | Automated permission tests per role and per layer pass on every endpoint; a denied request returns 404/403 and is logged. |
| FR-PLT-03 | Must | Activity log per position and per candidate (who did what, when). | Every create, update, status change, AI request, approval and send appears with actor and time; entries cannot be edited. |
| FR-PLT-04 | Must | Task and reminder engine: due follow-ups, interview dates, offer/start milestones appear in a "My tasks today" view. Reminders are in-app (Must); email notifications through the outbox are a Should-priority addition. | Tasks due today and overdue are listed per user; complete and snooze update immediately; each task links to its record. |
| FR-PLT-05 | Must | File storage for resumes, JDs and generated PDFs; originals are never overwritten. | Uploaded originals are byte-identical on download; new versions never replace them. |
| FR-PLT-06 | Must | Global search across clients, positions and candidates. | One search returns clients, positions and candidates within the tenant and the user's permissions, < 2 s p95 (NFR-P03). |
| FR-PLT-07 | Should | Audit export of activity and AI provenance. | Admin exports activity and AI provenance for a date range as CSV/JSON. |
| FR-PLT-08 | Must | Candidate data rights: export and delete a candidate's data on request, initiated by the agency or by the candidate in the portal (agency approves). U.S. state rules first; PIPA-ready. | Export delivers all of a candidate's data and files; deletion removes or anonymizes personal data and files, keeps aggregate KPI counts, and is logged with a deadline tracked. |

### 3.3 Multi-tenancy & agency administration (new 2026-10-06)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-TEN-01 | Must | Every record belongs to exactly one **tenant (agency)**; isolation enforced in the data layer, not only in UI. | Automated tests prove no cross-tenant read/write on every API; DB-level guard (e.g., row-level security or mandatory tenant scoping). |
| FR-TEN-02 | Must | Agency onboarding: create workspace (by platform administrator or self-serve ⚠ Q-27), first admin, invite recruiters. | New agency usable within one session. |
| FR-TEN-03 | Must | Agency admin manages users and roles, ownership rules, defaults (matching weights, outreach intervals, guard rules block/warn, rejection reasons). | Settings apply per tenant only. |
| FR-TEN-04 | Should | Branding per agency: logo and colors on portals, PDFs and emails (⚠ Q-28). | Submission PDF and portal show agency brand, not EaseMuse or Team of Wakers. |
| FR-TEN-05 | Must | Plans, seats and AI usage metering per tenant; billing through Interactor Billing Server (⚠ Q-27). | Usage per tenant visible to admin and platform administrator; limits enforceable. |
| FR-TEN-06 | Must | Tenant data export (all records + files) and tenant deletion at contract end. | Export in documented format; deletion logged. |
| FR-TEN-07 | Must | Platform admin section (`/admin`): tenants, plans, usage, support access **only with tenant consent and logged** (break-glass). | Platform administrator cannot browse candidate data without a logged, time-limited grant. |
| FR-TEN-08 | Should | Per-tenant data region setting (U.S. default; Korea later). | Region chosen at tenant creation. |

### 3.5 Platform admin section `/admin` (new 2026-10-06, product owner request)

For Team of Wakers platform administrators. Separate from **agency admin** settings, which live inside each agency's workspace. `/admin` shows platform metadata only; agency content (candidates, clients, positions, documents) is visible only through a support grant the agency approves.

| ID | Priority | Release | Requirement | Acceptance criteria |
|----|----------|---------|-------------|---------------------|
| FR-ADM-01 | Must | 1 | `/admin` area for users with a platform role (`owner`, `admin`, `support`), signed in with Interactor login and MFA; its own route group, API (`/api/admin/v1`) and route class. | Non-platform users get 404 on every `/admin` page and API; permission tests per role. |
| FR-ADM-02 | Must | 1 | **Agencies**: list and search; create an agency with its first agency-admin invite; view status, region, plan, seats, member count and month-to-date AI cost. | New agency usable the same day; list loads < 2 s for 500 agencies. |
| FR-ADM-03 | Must | 1 | **Suspend / reactivate** an agency (reason required). Suspended agencies can't sign in or run jobs; data is kept. | Sign-in and API return a "workspace suspended" message; jobs for that agency are skipped; action logged. |
| FR-ADM-04 | Must | 1 | **Platform admins**: owners invite, change role and remove platform admins. | At least one owner always remains; all changes logged. |
| FR-ADM-05 | Must | 1 | **Usage and cost**: AI cost and tokens by agency, purpose and model, per day and month; set each agency's AI budget. | Figures match the `LlmCall` ledger; budget change applies to the next AI request. |
| FR-ADM-06 | Must | 1 | **Platform audit log** of every `/admin` action, searchable by admin, agency and action. | Append-only; entries never contain candidate or client content. |
| FR-ADM-07 | Must | 2 | **Support access**: request a time-limited, read-only grant from an agency admin (FR-TEN-07); while active, view that agency's workspace read-only, with a banner. | No agency content without an active grant; every view logged in both the platform audit log and the agency's activity log. |
| FR-ADM-08 | Must | 2 | **Plans and billing** (Interactor Billing Server), **tenant export and deletion** (FR-TEN-05, FR-TEN-06). | Deletion needs a typed confirmation and a second owner/admin's approval. |
| FR-ADM-09 | Should | 2 | **System health**: job queues and failures (`JobRun`), outbox failures, AI error and refusal rates, per agency, without content. | Shows counts and ids only. |
| FR-ADM-10 | Should | 2 | **Platform configuration**: view the AI routing table and prompt versions (ADR-005), manage default templates (Q-15) and per-agency feature flags. | Changes logged; routing changes require the eval to have passed (NFR-AI05). |

### 3.4 Messaging (new 2026-10-06)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-MSG-01 | Must | Compose and send email from the app (outreach touches, portal invites, notifications). Each outreach message is sent only by a recruiter click on that message (DP-2). | No outreach email leaves without a per-message user action; system notifications (invites, reminders) are allowed. |
| FR-MSG-02 | Must | **Outbox** with statuses queued → sent → failed/bounced, retries, and full log. | Every message traceable to sender, entity and content. |
| FR-MSG-03 | Must | **Pluggable transport** interface. Ship with a development transport (captures mail, nothing leaves) and a log-only mode; real provider (agency's Gmail/Microsoft 365, or a Team of Wakers sending domain) added later without changing callers. | Swapping transport is configuration, not code changes in features. |
| FR-MSG-04 | Should | Inbound replies: recruiter marks replies manually now; reply sync arrives with the real provider. | Recruiter can mark a reply on any sent message; with a provider connected, replies are matched to the outbox message and the sequence stops. |
| FR-MSG-05 | Must | Unsubscribe / opt-out link on outreach email; opt-out sets do-not-contact for that tenant. | CAN-SPAM compliant footer per tenant. |
| FR-MSG-06 | Could | SMS through the same outbox/transport pattern (consent required). | SMS uses the same outbox and per-message send; sending blocked without recorded SMS consent. |

---

## 4. Functional requirements by system

### System 1: Client Intake & JD Analysis (§3)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-INT-01 | Must | Create **clients** (company) and **contacts** (hiring managers). | Client with ≥1 contact can be created, edited, archived. |
| FR-INT-02 | Must | Create a **position** with: company, title, department, reporting line, location, work arrangement, compensation range, required experience, required skills, hiring timeline, number of openings, visa/work authorization requirements (§3.1). | All 12 fields available; title, client and location required; position has a status: DRAFT → INTAKE → SOURCING → INTERVIEWING → OFFER → FILLED, plus ON_HOLD and CANCELLED ([planning-handoff.md §3](./planning-handoff.md#3-pipeline-state-machine-pipelineentry)). |
| FR-INT-03 | Must | Upload or paste the client's original JD (PDF, DOCX, text). | Original stored unchanged and viewable. |
| FR-INT-04 | Must | **AI JD structuring** on request: Position Summary, Key Responsibilities, Required Qualifications, Preferred Qualifications, Core Competencies, Technical Skills, Industry Experience, Leadership/Management, Years of Experience, Education/Certification, Location, Compensation, Work Authorization (§3.2). | Draft fills each section or marks it "missing"; missing items listed for follow-up. |
| FR-INT-05 | Must | AI proposes a category per requirement: **Must-Have / Preferred / Nice-to-Have / Disqualifying**. Recruiter can change, add, delete and reorder. | Each requirement has exactly one category after approval. |
| FR-INT-06 | Must | AI generates an **intake question list** for the hiring manager, focused on missing or ambiguous items. | List editable; can be exported/copied. |
| FR-INT-07 | Should | **Market benchmarking** on request via **AI web search** (no paid data): similar titles, responsibilities, skills, experience level, industry requirements, education, compensation (pay-transparency postings, public salary data), location/work arrangement; combined with the agency's **own past positions** in the system (decided, Q-21); then suggested additions and an improved JD draft (§3.3). | Every web claim shows source URL and date; internal-data claims link to the records; the two are labelled separately; output is a draft. |
| FR-INT-08 | Must | Produce an **improved JD** document from the approved structure; export for sending to the hiring manager (DOCX/PDF/copy). | Export matches approved content. |
| FR-INT-09 | Must | **HM intake record** (§3.4): business reason, key challenges after joining, 6- and 12-month expectations, must-have experience, preferred experience, conditions not to consider, organization/reporting structure, compensation range, interview process, expected timeline. | All 10 fields captured; free text plus structured where sensible (e.g., interview stages list). |
| FR-INT-10 | Must | HM approves the JD **in the HM portal** (or the recruiter records an approval received elsewhere: date, by whom, method). | Position cannot move to SOURCING until approval is recorded (configurable block/warn). |
| FR-INT-11 | Must | Generate the **Candidate Success Profile** from the approved JD + intake record; recruiter edits and confirms. This is the reference for matching. | Success profile versioned; matching uses the confirmed version and shows which version it used. |
| FR-INT-12 | Could | Clone a past position as a starting point for a new one. | Cloned position copies structure, requirements and weights, but not candidates, approvals or intake answers. |

### System 2: Sourcing & Talent Pool (§4)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-SRC-01 | Must | Generate a **search criteria sheet** from the confirmed profile: job titles (incl. alternates), skills, industry, target companies, geography, years of experience, education, seniority, leadership experience (§4.1). | Sheet editable and copyable. (Generating a Boolean search string is a Could-priority addition.) |
| FR-SRC-02 | Must | **Add a candidate** by uploading a resume (PDF/DOCX), pasting profile text, or entering manually. Record the **source** (LinkedIn, referral, direct sourcing, database, networking, other) and the profile URL. | Source required; used by analytics. |
| FR-SRC-03 | Must | **AI profile structuring** (§4.2): current position, career history, core skills, industry experience, technical skills, leadership experience, team size, career progression, major achievements, location, work authorization, compensation expectation, potential career motivation, potential concerns. | Fields not in the source are left empty, not guessed; "potential" fields are labelled inference. |
| FR-SRC-04 | Must | **Duplicate detection** on add: match on email, phone, profile URL, and name + employer similarity. Offer merge or link. | Possible duplicates shown before save; merges keep both source documents. |
| FR-SRC-05 | Must | Link a candidate to one or more positions (creates a pipeline entry per position). | Same candidate can be in several positions with separate statuses. |
| FR-SRC-06 | Should | **Similar candidates from the pool** for a position, on request: ranked list of existing candidates with a short reason each. | Results are suggestions only; recruiter adds them explicitly. |
| FR-SRC-07 | Should | **Candidate portfolio** (§4.3), on request: fit level (Strong / Moderate / Low) of a candidate against all open positions, with one-line reasons. | Shown on candidate page; never auto-adds to pipelines. |
| FR-SRC-08 | Must | Talent pool search and filters: skills, title, location, industry, seniority, availability, last contact, tags, past outcomes. | Free text plus filters; results under 2 s for 50k candidates (NFR-P03). |
| FR-SRC-09 | Must (flag) / Should (tags, notes) | "Do not contact" flag with reason and date (**Must**, release 1, needed by FR-OUT-07 and FR-MSG-05); tags and notes on candidates (Should). | Do-not-contact blocks outreach drafting and sending; tags filterable in pool search. |
| FR-SRC-10 | Should | Bulk resume upload (e.g., 20 files) creating draft profiles to review. | Each needs recruiter confirmation. |

### System 3: Matching Analysis (§5)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-MAT-01 | Must | Per position **matching model** with default weights: Core Competencies 40, Relevant Experience 20, Industry/Functional 15, Career Level/YoE 10, Location/Work Arrangement 5, Education/Certification 5, Compensation/Other 5. Recruiter can change weights per position. | Weights must sum to 100; changes logged. |
| FR-MAT-02 | Must | **Match analysis** on request for selected candidates (one or many) against the approved JD + Success Profile. Output: score per criterion, overall score, **Strong Match** points, **Potential Gaps**, **To Confirm** items, each with evidence (FR-AI-05). | Overall score = weighted sum of criterion scores, so it is explainable; analysis shows profile/JD versions used. |
| FR-MAT-03 | Must | Disqualifying factors and must-haves are shown prominently as "not met / unknown / met". They do **not** auto-exclude anyone. | No candidate is hidden or status-changed by analysis. |
| FR-MAT-04 | Must | Recruiter can **override** any criterion score or the overall score, with a reason. Original and override both stored. | Dashboard shows the override marker; history kept. |
| FR-MAT-05 | Must | **Recruiter Assessment** field written by the recruiter (not AI) attached to the analysis. | Field cannot be filled by AI generation. |
| FR-MAT-06 | Must | **Candidate review dashboard** per position: overall, core competency, experience, industry, location, compensation fit, risk/gap summary, recruiter assessment, status (§5.3). Sort, filter, and **manual reorder**. | Default order = suggested review order (score); recruiter's manual order persists. |
| FR-MAT-07 | Should | Re-run analysis when the success profile or weights change; old results marked "stale". | Stale badge shown; no automatic re-run (DP-2). |
| FR-MAT-08 | Could | Side-by-side comparison of 2–4 candidates. | 2–4 selected candidates shown in columns per criterion with evidence; no ranking beyond the existing scores. |

### System 4: Screening & Assessment (§6)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-SCR-01 | Must | Screening checklist per candidate-position: career consistency, job changes, employment gaps, actual scope, team size, reporting structure, accomplishments, technical competency, leadership competency, compensation expectation, location, work authorization, relocation, career motivation. Each: rating/notes. | All 14 items available; none mandatory unless configured. |
| FR-SCR-02 | Must | Recruiter classifies: **Priority / Potential / Hold / Not Qualified**, with a reason for Not Qualified. | Classification only by a recruiter action. |
| FR-SCR-03 | Should | AI can pre-fill screening observations it can read from the resume (e.g., gaps, tenure pattern) as a draft. | Labelled AI draft; recruiter confirms. |

### System 5: Outreach (§7)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-OUT-01 | Must | AI drafts a personalized message per candidate and channel, built on **Why You + Why This Role + Why Now**, covering: reason for contact, role highlights, company/business opportunity, career growth, role impact, compensation, location/work arrangement, next step (§7.3). | Recruiter can choose which elements to include (e.g., hide compensation); length fits channel (LinkedIn InMail/connection note limits, SMS length). |
| FR-OUT-02 | Must | **Multi-touch sequence**: Touch 1 Initial Introduction, Touch 2 Follow-up/Additional Info, Touch 3 Final Follow-up, with recruiter-set intervals. Channels: LinkedIn, email, text, phone/cold call (call script). | Sequence per candidate-position; each touch drafted on request. |
| FR-OUT-03 | Must | **Email**: recruiter sends from the app via the outbox (FR-MSG-01…03). **LinkedIn, text, phone**: copy / call script, then mark sent. The system never sends without a click on "send" for that specific message. | Every sent message logged with channel, time, content. |
| FR-OUT-04 | Must | Follow-up reminders when the next touch is due; stop the sequence when the candidate replies or the recruiter stops it. | Reminders appear in task view; reply status set by recruiter (or email sync ⚠). |
| FR-OUT-05 | Must | Response tracking: no response / interested / not interested / not now / referred someone. | Feeds response-rate KPI. |
| FR-OUT-06 | Should | Message templates per recruiter and per client that AI drafts start from. | AI drafts start from the selected template; templates scoped to recruiter or client within the tenant. |
| FR-OUT-07 | Must | Respect do-not-contact and opt-out; show the last contact date to avoid over-contacting. | Drafting blocked for do-not-contact; warning if contacted in last N days by anyone. |

### System 6: Qualification (§8)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-QUA-01 | Must | AI generates a **call question list** for the candidate, covering interest level, motivation, reason for moving, current satisfaction, compensation, location/relocation, work authorization, availability/notice, interview availability, other processes, decision factors, counteroffer risk, plus open "to confirm" items from match analysis. | Editable; printable/copyable. |
| FR-QUA-02 | Must | Record qualification results in structured fields (e.g., Interest: High/Med/Low; Compensation: Aligned/Gap + amounts; Location: Confirmed; Motivation; Availability: 30 days; Interview readiness). | Fields feed the submission report. |
| FR-QUA-03 | Must | Paste or type free-form call notes; AI turns them into the structured fields as a draft. | Recruiter confirms each field. |
| FR-QUA-04 | Could | Upload a call recording/transcript for summarization. ⚠ consent rules for recording (Q-20). | Transcript summary is a draft into FR-QUA-02 fields; upload blocked until recording consent is confirmed. |

### System 7: Resume & Profile Preparation (§9)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-RES-01 | Must | AI drafts a **tailored resume** for a position: emphasizes relevant experience, achievements, leadership scope, industry, technical skills; **does not change or exaggerate facts**. | Fact check (FR-AI-06) passes or shows warnings; original resume remains attached and unchanged. |
| FR-RES-02 | Must | Resume formatting to the agency's template (default template from Team of Wakers; logo and colors per FR-TEN-04); option to remove contact details (blind submission). | Export DOCX and PDF. |
| FR-RES-03 | Must | **Candidate approves** the tailored resume and profile **in the candidate portal** (approve / request changes with comments); recruiter can record an approval received elsewhere. | Submission blocked until approval is recorded (override with reason). |

### System 8: Submission (§10)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-SUB-01 | Must | AI drafts the **Candidate Submission Report** with 14 sections: Candidate Overview, Current Position, Career Summary, Key Qualifications, Relevant Achievements, JD Match, Reasons for Recommendation, Potential Concerns/Gaps, Compensation Expectation, Location/Relocation, Work Authorization, Candidate Motivation, Interview Availability, **Recruiter's Assessment** (recruiter-written only). | Draft pulls from approved profile, match analysis, qualification data; section 14 is empty until recruiter writes it. |
| FR-SUB-02 | Must | **Publish** the approved report and tailored resume to the **HM portal**, and export as an agency-branded **PDF**. | Portal view and PDF match the approved version; files stored with the submission. |
| FR-SUB-03 | Must | Record the submission: date, to whom, method, documents. Status → Submitted. | Feeds submission KPIs. |
| FR-SUB-04 | Should | Prevent submitting the same candidate to the same client twice, and warn about submitting a candidate to a client they work for (⚠ conflict rules). | Submitting the same candidate to the same client again shows the earlier submission and requires a reason. |

### System 9: Interview & Feedback (§11)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-IVW-01 | Must | Interview rounds per candidate-position: round name, date/time, interviewers, format, status (scheduled, completed, cancelled, no-show). | Upcoming interviews in task view. |
| FR-IVW-02 | Must | Statuses: next interview, hold, rejection (with reason), final decision. | Rejection reason taxonomy configurable. |
| FR-IVW-03 | Must | **Structured HM feedback**, entered by the HM in the portal or by the recruiter: Technical Fit, Leadership Fit, Communication, Cultural Fit, Industry Experience rated (Strong / Moderate / Gap) plus comments. Candidate feedback captured separately. | Feedback searchable by client and criterion (feeds System 12). |
| FR-IVW-04 | Should | AI turns pasted feedback (email text) into the structured format as a draft. | Pasted text becomes a draft of the FR-IVW-03 ratings and comments; recruiter confirms each rating. |
| FR-IVW-05 | Could | Calendar integration (Google/Outlook) for interview scheduling. ⚠ | Confirmed interview creates a calendar event for the recruiter; changes in the app update the event. |

### System 10: Offer & Closing (§12)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-OFF-01 | Must | Offer record: offer preparation, compensation discussion, candidate expectation, counteroffer risk, resignation timing, start date, acceptance, pre-employment process, onboarding status. | Each item has status and date. |
| FR-OFF-02 | Must | Reminders until the start date (e.g., check-in after resignation, week before start). | Placement not "closed" until start confirmed. |
| FR-OFF-03 | Must | Outcomes: accepted, declined (reason), reneged/withdrew, started. Position → filled when openings are met. | Each outcome is a recruiter action with date; Declined/Reneged require a reason; position status becomes Filled when accepted placements equal openings. |

### System 11: Analytics (§13)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-ANA-01 | Must | KPIs: Time-to-Fill, Time-to-Interview, Outreach Response Rate, Candidate Conversion Rate (stage to stage), Interview-to-Offer, Offer Acceptance, Source-to-Hire, Submission-to-Interview, Interview-to-Hire. | Each KPI has a written formula (see [planning-handoff.md §6](./planning-handoff.md#6-kpi-definitions-draft)); filter by date range, client, position, recruiter. |
| FR-ANA-02 | Must | Source performance: LinkedIn, referral, direct sourcing, database, networking, other: counts and conversion at each stage. | Source table shows, per source, candidates added, contacted, submitted, interviewed, offered and hired, with stage conversion rates; matches the KPI formulas in planning-handoff §6. |
| FR-ANA-03 | Must | Product metrics for DP-5: active positions per recruiter, time per position. | Shows active positions per recruiter (weekly average) and median time per position for any date range; formulas per planning-handoff §6. |
| FR-ANA-04 | Should | Export to CSV. | Every KPI table exports to CSV with the same filters applied. |

### System 12: Experience & Feedback Reuse (§14)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-KNW-01 | Should | Searchable history: for a client or similar position, show past submissions, interview outcomes, structured HM feedback and hires. | Recruiter can open "What has this client liked before?" from a position. |
| FR-KNW-02 | Should | Reports answering the brief's questions: which profiles reach interview / hire; which sources produce quality; which JDs get high response; where candidates drop out; what HMs actually prefer; which job-related candidate characteristics are associated with successful hires (brief §14, 7th question; protected characteristics excluded per FR-AI-09). | Descriptive reports covering all 7 questions in brief §14; no automated decisions. |
| FR-KNW-03 | Could | On request, AI summarizes patterns across past searches for a client ("candidates this HM advanced tended to have…") with links to the underlying records. | Summary is a draft with evidence links. |

### System 13: Hiring Manager Portal (new 2026-10-06; scope ⚠ Q-24)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-HMP-01 | Must | Recruiter invites an HM (client contact) to the portal; sign-in by invite / magic link (Q-23). | HM sees only their client's positions shared with them. |
| FR-HMP-02 | Must | HM reviews the improved JD and approves or requests changes with comments. | Approval updates FR-INT-10 and notifies the recruiter. |
| FR-HMP-03 | Should | HM answers the intake questionnaire online (the recruiter can still run it as a call). | Answers land in the intake record as "from HM" for recruiter review. |
| FR-HMP-04 | Must | HM sees **only submitted candidates**: submission report, tailored resume, status. Never match scores, sourcing lists, other candidates or recruiter-internal notes. | Permission tests prove this. |
| FR-HMP-05 | Must | HM gives decisions (interview / hold / reject with reason) and structured interview feedback (FR-IVW-03). HM decisions are **proposals**: the pipeline status changes only when the recruiter confirms (DP-1; brief §15: the HM decides the hire, the recruiter manages the process). | Recruiter notified; status unchanged until the recruiter confirms; always, not configurable. |
| FR-HMP-06 | Should | HM proposes interview times; recruiter confirms. | HM proposes up to 5 slots; recruiter confirms one, and the interview round is created (FR-IVW-01). |
| FR-HMP-07 | Must | Portal works on phone browsers; agency-branded; no training needed. | Key actions ≤ 3 clicks from the email link. |

### System 14: Candidate Portal (new 2026-10-06; scope ⚠ Q-25)

| ID | Priority | Requirement | Acceptance criteria |
|----|----------|-------------|---------------------|
| FR-CDP-01 | Must | Recruiter invites a candidate; sign-in by invite / magic link (Q-23); identity separate per agency (⚠ Q-26). | Candidate sees only their own data at that agency. |
| FR-CDP-02 | Must | Candidate reviews the tailored resume and profile; approves or requests changes with comments. | Updates FR-RES-03; recruiter notified. |
| FR-CDP-03 | Must | Candidate gives and withdraws **consent** (data processing, being submitted to a named client) in the portal; privacy notice shown. The recruiter can also record consent received elsewhere (date, method), which is how consent is captured in release 1 before the portal exists. | Submission to a client requires recorded consent for that client (block/warn configurable per tenant). |
| FR-CDP-04 | Should | Candidate updates contact details, availability, compensation expectation, work authorization; changes arrive as proposals for the recruiter. | Recruiter accepts into the profile. |
| FR-CDP-05 | Should | Candidate sees the status of their own submissions at a level the agency chooses (e.g., "Submitted", "Interviewing"). | No client feedback text shown unless the recruiter shares it. |
| FR-CDP-06 | Must | Candidate requests data export or deletion (FR-PLT-08). | Request tracked with deadline. |
| FR-CDP-07 | Must | Portal works on phone browsers; agency-branded. | Every portal action works at 360 px width; portal shows the agency logo and colors (FR-TEN-04); passes axe WCAG 2.1 AA checks. |

---

## 5. Non-functional requirements (targets proposed)

### Performance
| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-P01 | Page load (typical screen) | < 2 s p95 | High |
| NFR-P02 | Non-AI API responses | < 300 ms p95 | High |
| NFR-P03 | Talent pool search | < 2 s p95 at 50k candidates | High |
| NFR-P04 | AI drafts (single JD, profile, message) | First output < 10 s; complete < 45 s; streaming where possible | High |
| NFR-P05 | Batch match analysis (e.g., 30 candidates) | Runs as a background job started by the recruiter; progress shown; < 5 min | Medium |

### Security & privacy
| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-S01 | Authentication | Interactor login (Account Server); MFA required for agency admins and recruiters; invite/magic-link for portal users (Q-23) | High |
| NFR-S08 | Tenant isolation | Zero cross-tenant access; isolation tests in CI on every endpoint; periodic penetration test | High |
| NFR-S09 | External users | Portal sessions short-lived; invite links single-use and expiring; rate limiting on portal endpoints | High |
| NFR-S10 | Vendor assurance | DPA template, sub-processor list, security overview for agency customers; SOC 2 readiness as a later goal | Medium |
| NFR-S02 | Encryption | TLS 1.2+ in transit; encryption at rest for DB and files | High |
| NFR-S03 | Authorization | Role- and ownership-based access on every API (FR-PLT-02) | High |
| NFR-S04 | Personal data | Data minimization; retention policy; export and delete (FR-PLT-08); ⚠ jurisdictions per Q-07 | High |
| NFR-S05 | AI provider | Zero data retention / no training on inputs; DPA in place | High |
| NFR-S06 | Audit | Immutable activity log and AI provenance retained ≥ 2 years (⚠ confirm) | High |
| NFR-S07 | Client confidentiality | Compensation and confidential search data visible only to authorized users | High |

### AI quality & fairness
| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-AI01 | Evaluation set | Before launch: ≥ 30 real (anonymized) JDs and ≥ 100 resumes with recruiter-labelled expected outputs | High |
| NFR-AI02 | Extraction accuracy | ≥ 95% field accuracy on profile structuring for fields present in source | High |
| NFR-AI03 | Hallucination | 0 invented facts in tailored resumes/reports on eval set; fact-check warnings on any unsupported claim | High |
| NFR-AI04 | Bias testing | Match scores tested for disparity across name/gender/age proxies on paired resumes; documented before launch (⚠ legal, see research notes §3) | High |
| NFR-AI05 | Model change control | Prompt and model versions pinned; re-run eval set before changing | Medium |

### Reliability & operations
| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-R01 | Uptime (SaaS; portals used by clients and candidates) | 99.9% monthly | High |
| NFR-R02 | Backups | Daily, 30-day retention, tested restore | High |
| NFR-R03 | AI provider outage | Non-AI features keep working; AI buttons show "unavailable" | High |

### Scalability
| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-SC01 | Tenants and users | Many agencies and recruiters: design for 500 tenants, 5,000 recruiters, plus portal users (to size with Q-30) | High |
| NFR-SC02 | Data per tenant | 100k candidates, 5k positions, 1M activity records per large tenant | Medium |
| NFR-SC03 | Noisy neighbors | Per-tenant AI and job quotas so one agency can't starve others | High |

### Usability
| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-U01 | Accessibility | WCAG 2.1 AA | High |
| NFR-U02 | Devices | Recruiter workbench: desktop first (≥ 1280 px). **HM and candidate portals: mobile-first**, full functionality on phones | High |
| NFR-U03 | Browsers | Last 2 versions of Chrome, Edge, Safari | Medium |
| NFR-U04 | Language | English first; **Korean-ready** (next-intl, no hard-coded strings); AI outputs in the language the recruiter selects | High |
| NFR-U05 | AI drafts | Always visibly marked; one-click edit; never auto-applied | High |

---

## 6. Dependencies

### External
| Dependency | Purpose | Risk |
|------------|---------|------|
| LLM provider (e.g., Anthropic Claude) | Structuring, analysis, drafting | Medium: cost, latency, data terms |
| Embeddings + pgvector (already in target stack) | Similar candidates, pool search | Low |
| Document parsing (PDF/DOCX text extraction) | Resume and JD intake | Low–Medium: scanned PDFs need OCR |
| PDF generation | Submission report, resume | Low |
| LLM web search tool (e.g., Claude web search) | Benchmarking (FR-INT-07), no paid data | Medium: result quality, citation accuracy, per-search cost |
| Email provider (TBD: agency Gmail/Microsoft 365 via OAuth, or a Team of Wakers sending domain) | Real transport for FR-MSG; **not connected in first release** | Medium: deliverability, OAuth verification |
| SMS provider | Optional text outreach | Medium: consent (TCPA in U.S.) |
| Calendar (Google / Outlook) | Optional interview scheduling | Low |

### Internal
| Dependency | Owner | Status |
|------------|-------|--------|
| JDs and resumes for evaluation (public JDs collected; resumes per Q-18 decision) | Team of Wakers | Needed before Planning ends |
| Default submission report and resume template (Team of Wakers as vendor), plus per-agency branding (FR-TEN-04) | Team of Wakers | Needed |
| Legal review of data flows and AI use | Legal | Needed before pilot |
| SaaS terms, DPA, privacy policy for agencies, HMs and candidates | Legal | Needed before first external customer |
| Pricing and plans (Q-27) | Sponsor | Needed for billing design |

---

## 7. Traceability (brief → requirements → stories)

| Brief section | Requirements | Epic in [user-stories.md](./user-stories.md) |
|---------------|-------------|------------------------|
| §1.1 principles | FR-AI-01…09 | E0 |
| §3 Intake & JD | FR-INT-01…12 | E1 |
| §4 Sourcing & pool | FR-SRC-01…10 | E2 |
| §5 Matching | FR-MAT-01…08 | E3 |
| §6 Screening | FR-SCR-01…03 | E4 |
| §7 Outreach | FR-OUT-01…07 | E5 |
| §8 Qualification | FR-QUA-01…04 | E6 |
| §9 Resume | FR-RES-01…03 | E7 |
| §10 Submission | FR-SUB-01…04 | E8 |
| §11 Interview | FR-IVW-01…05 | E9 |
| §12 Offer | FR-OFF-01…03 | E10 |
| §13 Analytics | FR-ANA-01…04 | E11 |
| §14 Reuse | FR-KNW-01…03 | E12 |
| (implied) | FR-PLT-01…08 | E0 |
| Decision 2026-10-06 (`/admin`) | FR-ADM-01…10 | E16 |
| Decision 2026-10-06 (SaaS) | FR-TEN-01…08 | E13 |
| Decision 2026-10-06 (messaging) | FR-MSG-01…06 | E5 |
| Decision 2026-10-06 (HM portal) | FR-HMP-01…07 | E14 |
| Decision 2026-10-06 (candidate portal) | FR-CDP-01…07 | E15 |

---

## 8. Glossary

| Term | Meaning |
|------|---------|
| Tenant / agency | A recruiting agency that subscribes to the workbench; all its data is isolated |
| Platform administrator | Team of Wakers staff who run the SaaS |
| HM portal / candidate portal | Restricted web views where hiring managers and candidates act on what the recruiter shares |
| Outbox / transport | Queue of outgoing messages / the pluggable component that actually delivers them |
| Position | A client's job opening the recruiter is filling (job requisition) |
| JD | Job description |
| Hiring Manager (HM) | Client-side person who owns the position and decides the hire |
| Intake | Conversation with the HM to define the role beyond the JD |
| Candidate Success Profile | Confirmed definition of the ideal candidate: requirements by category, expectations, deal-breakers. The reference for matching |
| Talent pool | All candidates an agency (tenant) has recorded, reusable across that agency's positions; never shared between agencies (Q-22) |
| Candidate portfolio | One candidate's fit across several open positions |
| Pipeline entry | A candidate's progress within one position |
| Match analysis | AI-drafted comparison of a candidate to a position: weighted score, strengths, gaps, items to confirm |
| Recruiter Assessment | Recruiter's own written judgement; never AI-written |
| Qualification | Recruiter's call with an interested candidate to confirm motivation, compensation, availability, risks |
| Submission | Formal recommendation of a candidate to the HM with tailored resume and Submission Report |
| Counteroffer risk | Likelihood that the current employer keeps the candidate with a counteroffer |
| AI draft | Any AI-generated content not yet approved by a recruiter |

## 9. Approval

| Role | Name | Date |
|------|------|------|
| Product owner | | |
| Executive sponsor | | |
| Recruiter lead | | |
| Tech lead | | |

## 10. Revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-10-06 | Claude (AI-assisted, from init.docx) | Initial draft |
| 0.2 | 2026-10-06 | Claude (AI-assisted) | P0 answers: multi-tenant SaaS, HM and candidate portals, in-app email with pluggable transport, AI web-search benchmarking, U.S. first / Korea later |
