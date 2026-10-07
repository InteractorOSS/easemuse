# Step 5: User Stories

| Field | Value |
|-------|-------|
| **Status** | v0.2 (2026-10-06): added E13 Agency & tenancy, E14 HM portal, E15 Candidate portal; in-app email sending. Priorities proposed; sizes rough |
| **Date** | 2026-10-06 |
| **Requirements** | [requirements.md](./requirements.md) (FR IDs referenced on each story) |

Users: **Recruiter** (P-1), **Recruiting Lead** (P-2), **Hiring Manager** (P-3, HM portal), **Candidate** (P-4, candidate portal), **Agency Admin** (P-5), **Platform Administrator** (P-6, `/admin`). Recruiters can still record HM or candidate actions that happened outside the portals.

---

## Story map

```
Intake → JD → Success Profile → Source → Match → Screen → Outreach → Qualify → Resume → Submit → Interview → Offer → Analytics/Reuse
 E1      E1      E1              E2       E3      E4       E5         E6        E7       E8       E9          E10     E11/E12
──────────────────────────── release 1: multi-tenant core loop (internal use, tenant #1) ────────────────────────────
US-101  US-103  US-106          US-201   US-301  US-401   US-501     US-601    US-701   US-801   US-901      US-1001
US-102  US-104  US-107          US-202   US-302  US-402   US-502     US-602    US-702   US-802
        US-105                  US-203   US-303           US-503
                                US-204   US-304           US-504
                                US-207
                                US-208
──────────────────────────── release 2: portals, through start date, KPIs, billing ────────────────────────────
                                                 US-305           US-505                 US-803   US-902      US-1002  US-1101
                                                                                                  US-903               US-1102
──────────────────────────── release 3: pool intelligence, reuse, benchmarking ────────────────────────────
        US-108                  US-205                               US-603                                            US-1201
                                US-206                                                                                 US-1202
Platform: E0 US-001…008 (R1) · E13 US-1301…1304 (R1), US-1305…1308 (R2)
E14 HM portal (R2): US-1401, 1402, 1404, 1405 · (R3): US-1403, 1406
E15 Candidate portal (R2): US-1501…1503, 1505, 1507 · (R3): US-1504
```

---

## Backlog

| ID | Title | Epic | Priority | Size | FR |
|----|-------|------|----------|------|----|
| US-001 | Sign in and roles | E0 Platform | Must | M | PLT-01 |
| US-002 | Access control by ownership | E0 | Must | M | PLT-02 |
| US-003 | AI draft → approve lifecycle | E0 AI | Must | L | AI-01,02,04 |
| US-004 | AI provenance and evidence | E0 AI | Must | M | AI-03,05 |
| US-005 | Fact check on generated documents | E0 AI | Must | M | AI-06 |
| US-006 | My tasks today | E0 | Must | M | PLT-04 |
| US-007 | Activity log | E0 | Must | S | PLT-03 |
| US-008 | Candidate data export / delete | E0 | Must | M | PLT-08 |
| US-101 | Create client and hiring manager | E1 Intake | Must | S | INT-01 |
| US-102 | Create position | E1 | Must | S | INT-02,03 |
| US-103 | Structure a JD with AI | E1 | Must | M | INT-04,05 |
| US-104 | Intake question list | E1 | Must | S | INT-06 |
| US-105 | Improved JD export | E1 | Must | S | INT-08 |
| US-106 | Record HM intake and approval | E1 | Must | M | INT-09,10 |
| US-107 | Confirm Candidate Success Profile | E1 | Must | M | INT-11 |
| US-108 | Market benchmark | E1 | Should | L | INT-07 |
| US-201 | Search criteria sheet | E2 Sourcing | Must | S | SRC-01 |
| US-202 | Add candidate from resume | E2 | Must | M | SRC-02,03, PLT-05 |
| US-203 | Duplicate check | E2 | Must | M | SRC-04 |
| US-204 | Add candidate to position(s) | E2 | Must | S | SRC-05 |
| US-205 | Similar candidates from pool | E2 | Should | M | SRC-06 |
| US-206 | Candidate portfolio | E2 | Should | M | SRC-07 |
| US-207 | Talent pool search + global search | E2 | Must | M | SRC-08, PLT-06 |
| US-208 | Do-not-contact flag | E2 | Must | S | SRC-09 |
| US-301 | Set matching weights | E3 Matching | Must | S | MAT-01 |
| US-302 | Run match analysis | E3 | Must | L | MAT-02,03, AI-09 |
| US-303 | Override score with reason | E3 | Must | S | MAT-04 |
| US-304 | Review dashboard | E3 | Must | M | MAT-05,06 |
| US-305 | Stale analysis | E3 | Should | S | MAT-07 |
| US-401 | Screening checklist | E4 Screening | Must | M | SCR-01 |
| US-402 | Classify candidate | E4 | Must | S | SCR-02 |
| US-501 | Draft outreach message | E5 Outreach | Must | M | OUT-01 |
| US-502 | Multi-touch sequence and reminders | E5 | Must | M | OUT-02,04 |
| US-503 | Log sent message and response | E5 | Must | S | OUT-03,05,07 |
| US-504 | Send email from the app (outbox, dev transport) | E5 | **Must** | M | OUT-03, MSG-01…03,05 |
| US-505 | Connect a real mail provider + reply sync | E5 | Should | L | MSG-03,04 |
| US-601 | Call question list | E6 Qualification | Must | S | QUA-01 |
| US-602 | Structure call notes | E6 | Must | M | QUA-02,03 |
| US-603 | Call transcript summary | E6 | Could | M | QUA-04 |
| US-701 | Tailored resume draft | E7 Resume | Must | L | RES-01,02 |
| US-702 | Candidate approval and consent, recorded by recruiter | E7 | Must | S | RES-03, CDP-03 |
| US-801 | Submission report draft | E8 Submission | Must | L | SUB-01 |
| US-802 | Export PDF and record submission | E8 | Must | M | SUB-02,03 |
| US-803 | Duplicate submission guard | E8 | Should | S | SUB-04 |
| US-901 | Track interview rounds | E9 Interview | Must | M | IVW-01,02 |
| US-902 | Structured HM feedback | E9 | Must | S | IVW-03 |
| US-903 | Feedback from pasted email | E9 | Should | S | IVW-04 |
| US-1001 | Offer tracking | E10 Offer | Must | M | OFF-01,03 |
| US-1002 | Reminders to start date | E10 | Must | S | OFF-02 |
| US-1101 | Recruiting KPI dashboard | E11 Analytics | Must | L | ANA-01,02,03 |
| US-1102 | CSV export | E11 | Should | S | ANA-04 |
| US-1201 | Client history view | E12 Reuse | Should | M | KNW-01 |
| US-1202 | Pattern reports | E12 | Should | M | KNW-02,03 |
| US-1301 | Tenant isolation foundation | E13 Agency | Must | L | TEN-01 |
| US-1302 | Create agency workspace | E13 | Must | M | TEN-02 |
| US-1303 | Manage users, roles and defaults | E13 | Must | M | TEN-03 |
| US-1304 | AI usage metering and limits per tenant | E13 | Must | M | TEN-05, AI-08 |
| US-1308 | Plans, seats and billing via Billing Server | E13 | Must | M | TEN-05 |
| US-1305 | Platform admin section (`/admin`) + support access | E13 | Must | M | TEN-07 |
| US-1306 | Agency branding | E13 | Should | S | TEN-04 |
| US-1307 | Tenant export and deletion | E13 | Must | M | TEN-06 |
| US-1401 | Invite HM to portal | E14 HM portal | Must | M | HMP-01 |
| US-1402 | HM approves JD | E14 | Must | S | HMP-02 |
| US-1403 | HM answers intake online | E14 | Should | S | HMP-03 |
| US-1404 | HM reviews submissions | E14 | Must | M | HMP-04,07 |
| US-1405 | HM decision and feedback | E14 | Must | M | HMP-05 |
| US-1406 | HM proposes interview times | E14 | Should | S | HMP-06 |
| US-1601 | `/admin` access and shell | E16 Platform admin | Must | S | ADM-01 |
| US-1602 | Manage agencies (list, create, suspend) | E16 | Must | M | ADM-02,03 |
| US-1603 | Manage platform admins | E16 | Must | S | ADM-04 |
| US-1604 | Usage, cost and budgets across agencies | E16 | Must | M | ADM-05 |
| US-1605 | Platform audit log | E16 | Must | S | ADM-06 |
| US-1606 | System health and platform configuration | E16 | Should | M | ADM-09,10 |
| US-1501 | Invite candidate to portal | E15 Candidate portal | Must | M | CDP-01 |
| US-1502 | Candidate approves resume | E15 | Must | S | CDP-02,07 |
| US-1503 | Candidate consent | E15 | Must | M | CDP-03 |
| US-1504 | Candidate updates details | E15 | Should | S | CDP-04 |
| US-1505 | Candidate sees submission status | E15 | Should | S | CDP-05 |
| US-1507 | Candidate makes privacy requests | E15 | Must | S | CDP-06 |

---

## Story cards

Acceptance criteria use Given / When / Then. Every AI story also inherits US-003 to US-005 (draft lifecycle, provenance, fact check).

### E0: Platform & AI framework

#### US-003: AI draft → approve lifecycle (Must, L)
```
As a recruiter,
I want every AI result to arrive as a draft I can edit, approve or discard,
So that nothing reaches a client or candidate without my approval.
```
**Scenario 1: Approve after edit**
```
Given I requested an AI draft (e.g., JD structure)
When I edit it and click Approve
Then the approved version is saved and used by downstream features
And the AI original and my edits remain in version history
```
**Scenario 2: Downstream uses approved content only**
```
Given a candidate profile has an unapproved AI draft
When I generate a submission report
Then the report uses only approved profile data
And warns that "Profile has an unapproved draft"
```
**Scenario 3: No unrequested AI**
```
Given I open any page
When I do not click an AI action
Then no AI request is made
```

#### US-004: AI provenance and evidence (Must, M)
```
As a recruiter,
I want each AI claim about a candidate to show where it came from,
So that I can check it quickly and trust what I send.
```
- Given a match analysis, when I hover a strength or gap, then I see the resume/notes excerpt it is based on, or the label "Inferred".
- Admin can see model, prompt version, requester and input records for any AI output.

#### US-005: Fact check on generated documents (Must, M)
```
As a recruiter,
I want the system to flag any employer, title, date or number in a generated document that isn't in the candidate's source data,
So that I never send a misrepresented candidate.
```
- Given a tailored resume draft contains "Led a team of 25" and the source says 20, when the draft is shown, then that line is flagged and Approve requires me to resolve or confirm it.

#### US-006: My tasks today (Must, M)
```
As a recruiter,
I want one list of follow-ups, interviews and offer milestones due today or overdue,
So that nothing falls through across my positions.
```
- Given touch 2 is due today for 3 candidates, when I open My Tasks, then I see 3 outreach items linked to each candidate's draft.
- Completing or snoozing a task updates it immediately.

#### US-001 / 002 / 007 / 008
- **US-001**: Given valid credentials (+ MFA), I sign in; roles per FR-PLT-01 (agency admin, recruiter, optional lead; portal users sign in by invite, US-1401/1501).
- **US-002**: Given I am not owner or team member of a position, I cannot view its compensation or confidential notes (403 on API).
- **US-007**: Every create/update/status change/AI request/send appears in the position's and candidate's activity log with user and time.
- **US-008**: Given a candidate asks for deletion, when an admin deletes, then personal data and files are removed or anonymized, aggregate KPI counts survive, and the action is logged.

---

### E1: Client intake & JD

#### US-101: Create client and hiring manager (Must, S)
```
As a recruiter,
I want to register a client company and its hiring managers,
So that positions, intake and submissions are tied to the right people.
```
- Given I'm in my agency workspace, when I create client "Acme Corp" with contact "Ms. Park, VP HR, email", then both are saved in my tenant only.
- Creating a client with the same name as an existing one shows the existing record first.
- Archiving a client hides it from new-position pickers but keeps its history.

#### US-102: Create position (Must, S)
```
As a recruiter,
I want to register a new position with the client's details and original JD,
So that the whole search is tracked from day one.
```
- Given a client exists, when I enter title, location and the other §3.1 fields and upload the JD file, then the position is created in "Draft" with the original JD stored unchanged.
- Missing title, client or location → validation error per field.

#### US-103: Structure a JD with AI (Must, M)
```
As a recruiter,
I want AI to split the client's JD into standard sections and propose Must-Have / Preferred / Nice-to-Have / Disqualifying for each requirement,
So that I can see gaps and priorities at a glance.
```
**Scenario 1: Happy path**
```
Given a position with an original JD
When I click "Structure JD"
Then within 45 s I see a draft with the 13 sections
And each requirement has a proposed category I can change
And sections not found in the JD are marked "Missing — ask HM"
```
**Scenario 2: Unreadable file**
```
Given the JD is a scanned image PDF without text
When I click "Structure JD"
Then I see "Couldn't read text from this file" with an option to paste text
```

#### US-104: Intake question list (Must, S)
- Given a structured JD draft with 4 missing items, when I click "Prepare intake questions", then I get questions covering the 4 missing items plus the 10 §3.4 intake topics, editable and copyable.

#### US-106: Record HM intake and approval (Must, M)
- Given I had the intake call, when I fill the 10 intake fields and record "JD approved by Ms. Park on 2026-10-10 via email", then the position can move to "Sourcing".
- Given no approval is recorded, when I try to move to Sourcing, then I am warned (admin-configurable: block or warn).

#### US-107: Confirm Candidate Success Profile (Must, M)
```
As a recruiter,
I want a Candidate Success Profile generated from the approved JD and intake answers,
So that matching and outreach use what the client actually confirmed.
```
- Given approved JD + intake, when I click "Create success profile", then I get a draft with requirements by category, 6/12-month expectations, deal-breakers; after I confirm it becomes v1.
- Editing it later creates v2; match analyses made on v1 show "based on v1".

#### US-108: Market benchmark (Should, L)
- Given a position, when I click "Benchmark", then the AI runs a web search and I see typical titles, skills, experience, compensation ranges for similar roles with source URL and date per item, and a list of suggested JD changes I can accept one by one.
- Items from the agency's own past positions link to those records and are labelled "Our data", separately from "Web" items (Q-21).
- No paid data sources are used.

---

#### US-105: Improved JD export (Must, S)
- Given an approved JD structure, when I click "Export", then I get DOCX and PDF (agency-branded) and a copy-to-clipboard version, all matching the approved content exactly.
- In release 2 I can instead share it to the HM portal for approval (US-1402).

### E2: Sourcing & talent pool

#### US-201: Search criteria sheet (Must, S)
```
As a recruiter,
I want search criteria derived from the confirmed success profile,
So that I can start searching LinkedIn and other sources right away.
```
- Given a confirmed success profile, when I click "Search criteria", then I get job titles (incl. alternates), skills, industry, target companies, geography, years of experience, education, seniority and leadership experience (brief §4.1), editable and copyable.
- The system runs no searches itself (brief §4.1).

#### US-202: Add candidate from resume (Must, M)
```
As a recruiter,
I want to drop in a resume or paste a LinkedIn profile and get a structured candidate profile,
So that I don't re-type it.
```
- Given I upload a PDF resume and choose source "LinkedIn", when parsing finishes, then I see a draft with the §4.2 fields; fields not in the resume are empty, not guessed; "Potential motivation/concerns" are labelled as inference.
- I must confirm the draft before the candidate is saved as active.
- The original file is stored unchanged and stays downloadable (FR-PLT-05).

#### US-203: Duplicate check (Must, M)
- Given "Alex Kim, alex@x.com" exists, when I add a resume with the same email, then I see "Possible duplicate" with options Merge / Link / Create anyway (reason required).
- Merging keeps both resumes and all history.

#### US-204: Add candidate to position(s) (Must, S)
- Given a confirmed candidate, when I add them to positions A and B, then two pipeline entries exist with separate statuses, both starting at "Sourced".

#### US-207: Talent pool search (Must, M)
- Given 50k candidates, when I search "HR Director payroll California" with filter seniority=Director, then results show within 2 s with highlighted matching fields.
- The same search box finds clients and positions too (FR-PLT-06), within my tenant and permissions only.

#### US-208: Do-not-contact flag (Must, S)
- When I mark a candidate "Do not contact" with a reason, then outreach drafting and sending are blocked for that candidate across the agency, showing the reason and date.
- An email opt-out (FR-MSG-05) sets the same flag automatically, with reason "Opted out".
- Only an agency admin can clear the flag; the change is logged.

#### US-205 / US-206 (Should)
- **US-205**: Given a confirmed success profile, when I click "Find in my pool", then I see up to 25 existing candidates with one-line reasons; none are added until I add them.
- **US-206**: Given a candidate, when I click "Check open positions", then I see Strong/Moderate/Low fit per open position with reasons (e.g., Strong: HR Director, Moderate: HRBP).

---

### E3: Matching

#### US-301: Set matching weights (Must, S)
- Given a position, its weights start at the brief's defaults (§5.1: Core Competencies 40, Relevant Experience 20, Industry/Functional 15, Career Level 10, Location 5, Education 5, Compensation/Other 5) or the agency's defaults.
- When I set Core 50 / Experience 10, then Save is disabled until the total is 100.
- Saved changes are logged; existing analyses' overall scores are recomputed from stored criterion scores, with no new AI call (ADR-007).

#### US-302: Run match analysis (Must, L)
```
As a recruiter,
I want a fit analysis for selected candidates against the success profile,
So that I can decide quickly who to review and contact first.
```
**Scenario 1: Single candidate**
```
Given a confirmed success profile and weights
When I run analysis for Alex
Then I see criterion scores, overall score (weighted sum), Strong Match points, Potential Gaps and To Confirm items
And each point links to evidence or is labelled Inferred
```
**Scenario 2: Batch**
```
Given I select 30 candidates
When I click "Analyze"
Then a background job runs with progress, and I can keep working
And I am notified when done
```
**Scenario 3: Protected characteristics excluded (FR-AI-09)**
```
Given two resumes identical except for name, age signals and photo
When I run analysis on both
Then criterion scores are identical
And the analysis input shown in provenance contains no protected fields
```
**Scenario 4: Must-have unknown**
```
Given "Work authorization: US" is Must-Have and the resume doesn't say
When the analysis completes
Then Work authorization shows "Unknown — confirm"
And the candidate is not hidden or status-changed
```

#### US-303: Override score (Must, S)
- Given an overall score of 72, when I set it to 85 with reason "Payroll gap not relevant per HM", then the dashboard shows 85 with an override marker; the original 72 and reason are in history.

#### US-304: Review dashboard (Must, M)
- Given 40 candidates in a position, when I open the dashboard, then I see the §5.3 columns sorted by suggested order; I can drag to reorder and the order persists; filters by status and classification.
- No candidate is removed from the list by score.
- Recruiter Assessment column shows only recruiter-written text.

---

### E4: Screening

#### US-401 / US-402 (Must)
- **US-401**: Given a candidate in a position, when I open Screening, then I see the 14 checklist items with rating and notes; AI may pre-fill observations as a draft (FR-SCR-03, Should).
- **US-402**: When I classify as Priority / Potential / Hold / Not Qualified (reason required for Not Qualified), then the pipeline status updates and is logged. Only I can set it.

---

### E5: Outreach

#### US-501: Draft outreach message (Must, M)
```
As a recruiter,
I want a personalized first message built on why you, why this role, why now,
So that I can contact shortlisted candidates quickly with a message that feels personal.
```
- Given a Priority candidate and channel LinkedIn, when I click "Draft message", then I get a draft within LinkedIn's length limits referencing the candidate's actual background and the role's highlights.
- I can toggle elements (e.g., include compensation) and regenerate.
- Given the candidate is marked do-not-contact, the Draft button is disabled with the reason.

#### US-502: Multi-touch sequence and reminders (Must, M)
- Given I sent touch 1 on Monday with intervals 4 and 7 days, then touch 2 appears in My Tasks on Friday with a draft-on-request button; touch 3 seven days later.
- Given I mark "Candidate replied: Interested", the remaining touches are cancelled and the candidate moves to "Interested".

#### US-503: Log sent message and response (Must, S)
- For LinkedIn, text and phone: when I click "Copy & mark sent", the text is copied, the message is logged (channel, time, content), and the touch is complete. The system sends nothing by itself.
- Warning if anyone in this agency contacted this candidate in the last 30 days (configurable per agency).

---

#### US-504: Send email from the app (Must, M)
```
As a recruiter,
I want to send an approved outreach email from the workbench,
So that I don't copy text between tools and every message is logged.
```
**Scenario 1: Send**
```
Given an approved email draft for touch 1
When I click "Send" on that message
Then it enters the outbox, is delivered by the configured transport, and shows Sent with time
And the next touch is scheduled
```
**Scenario 2: No real provider yet**
```
Given the tenant uses the development transport
When I click "Send"
Then the message is captured in the dev mailbox / log, nothing leaves the system
And the UI shows "Test mode: not delivered"
```
**Scenario 3: Opt-out**
```
Given the candidate clicked unsubscribe on an earlier email
When I try to send
Then sending is blocked and the candidate shows "Opted out"
```
- No bulk "send all" for outreach: one click per message (DP-2).

### E6: Qualification

#### US-601 / US-602 (Must)
- **US-601**: Given an interested candidate, when I click "Call questions", I get a list covering the §8 topics plus the To Confirm items from match analysis.
- **US-602**: Given I paste rough notes ("pretty keen, wants 180-190k, 30 days notice, interviewing at 1 other place, current boss may counter"), when I click "Structure notes", then a draft fills Interest=High, Compensation=180–190k, Availability=30 days, Other processes=1, Counteroffer risk=Medium (inferred), and I confirm each field.

---

### E7: Resume preparation

#### US-701: Tailored resume draft (Must, L)
```
As a recruiter,
I want a version of the candidate's resume that puts forward what matters for this position, without changing facts,
So that the hiring manager sees the relevant experience immediately.
```
- Given an approved profile and success profile, when I click "Tailor resume", then I get a draft in the agency's template; the original resume stays attached and unchanged.
- Any fact not in the source is flagged (US-005).
- Option "Remove contact details" for blind submissions; export DOCX/PDF.

#### US-702: Candidate approval and consent, recorded by recruiter (Must, S)
- When I record "Sent to candidate 10/12, approved 10/13 by email", the resume approval is satisfied. Without approval, Submit asks for an override reason.
- When I record "Candidate consented to submission to Acme Corp, 10/13, by phone", consent for that client is satisfied (FR-CDP-03). Without it, Submit blocks or warns per agency setting.
- In release 2 the same approvals can come from the candidate portal (US-1502, US-1503); both paths use the same approval record.

---

### E8: Submission

#### US-801: Submission report draft (Must, L)
```
As a recruiter,
I want a Candidate Submission Report drafted from everything already recorded,
So that I can submit in minutes and add my own assessment.
```
- Given approved profile, match analysis and qualification data, when I click "Draft report", then sections 1–13 are drafted and section 14 "Recruiter's Assessment" is empty for me to write.
- Missing inputs (e.g., no qualification yet) are listed, and the related sections say "Not yet confirmed".
- I cannot approve the report with an empty section 14.

#### US-802: Export PDF and record submission (Must, M)
- When I approve and click "Export PDF", I get an agency-branded PDF matching the approved text; when I record "Submitted to Ms. Park by email on 10/14", the status becomes Submitted and the PDF and resume are stored with the submission.
- Release 2: "Publish to HM portal" makes the approved report and resume visible to that HM (FR-SUB-02; see US-1404). Publishing counts as the submission record.

---

### E9: Interview & feedback

#### US-901 / US-902 (Must)
- **US-901**: I add rounds (e.g., "HM interview, 10/20 2pm, video") and statuses; upcoming interviews show in My Tasks; I can set Next round / Hold / Rejected (reason) / Final decision.
- **US-902**: After a round, I record HM feedback as Technical / Leadership / Communication / Cultural / Industry = Strong / Moderate / Gap plus comments, and candidate feedback separately. This feedback appears in the client history (US-1201).

---

### E10: Offer & closing

#### US-1001 / US-1002 (Must)
- **US-1001**: For the selected candidate I track offer preparation, compensation discussion, expectation, counteroffer risk, resignation date, start date, acceptance, pre-employment and onboarding status; outcomes Accepted / Declined (reason) / Reneged / Started.
- **US-1002**: Given an accepted offer with start date 11/15, I get reminders (e.g., after resignation date, 1 week before start, day after start); the placement closes only when I confirm "Started".

---

### E11: Analytics

#### US-1101: Recruiting KPI dashboard (Must, L)
```
As a recruiter (and lead),
I want to see time-to-fill, conversion by stage and results by source,
So that I know what's working and where candidates drop out.
```
- Given data for the last quarter, when I open Analytics, I see the 9 KPIs from §13 with the formulas shown on hover, filterable by date, client, position and (for leads) recruiter.
- Source table shows counts and conversion at each stage for LinkedIn / Referral / Direct / Database / Networking / Other.
- Capacity panel: active positions per recruiter and median time per position.

---

### E12: Experience reuse

#### US-1201 / US-1202 (Should)
- **US-1201**: From a position, "Client history" shows past positions for this client, submitted candidates, interview outcomes, aggregated HM feedback by criterion and hires.
- **US-1202**: Reports for the §14 questions (profiles that reach interview/hire, quality by source, JD response rates, stage drop-off, HM preferences). On request, an AI summary of patterns with links to the records behind each statement.

---

### E13: Agency & tenancy

#### US-1301: Tenant isolation foundation (Must, L)
```
As an agency owner,
I want certainty that no other agency can see or change my data,
So that I can trust the platform with my clients and candidates.
```
- Given two agencies A and B, when any user of A calls any API with an ID belonging to B, then the response is 404 and the attempt is logged.
- Isolation tests run in CI for every endpoint and background job.

#### US-1302 / 1303 / 1304 / 1305 / 1306 / 1307
- **US-1302**: A platform administrator (or self-serve sign-up ⚠ Q-27) creates an agency; the first admin gets an invite and can invite recruiters the same day.
- **US-1303**: Agency admin adds/removes users, assigns roles, sets defaults (weights, outreach intervals, block/warn guards, rejection reasons).
- **US-1304** (R1): Every AI request records tokens and cost per tenant; admin sees this month's AI usage against a limit; at the limit, AI buttons show a clear message and non-AI work continues.
- **US-1308** (R2): Platform administrator assigns a plan; seats and usage are billed through Interactor Billing Server; admin sees plan, seats and invoices.
- **US-1305**: Platform administrator lists tenants, plans and usage; opening tenant data needs a time-limited grant from the agency admin, and every access is logged and visible to the agency.
- **US-1306**: Admin uploads logo and colors; portals, PDFs and emails use them.
- **US-1307**: Admin downloads a full export; at contract end the platform administrator deletes the tenant and the deletion is logged.

### E16: Platform admin (`/admin`)

#### US-1602: Manage agencies (Must, M)
```
As a platform administrator at Team of Wakers,
I want to create, find and suspend agency workspaces in /admin,
So that I can onboard customers and act on non-payment or abuse without touching their data.
```
- Given I'm a platform admin, when I create "Acme Talent" with region "us" and admin email, then the agency exists and its first admin gets an invite.
- Given I suspend an agency with a reason, then its users see "Workspace suspended" at sign-in, its jobs are skipped, its data is untouched, and the action is in the platform audit log.
- Given I'm a recruiter (no platform role), any `/admin` URL returns 404.

#### US-1601 / 1603 / 1604 / 1605 / 1606
- **US-1601**: `/admin` uses Interactor login with MFA; roles `owner`, `admin`, `support` (support is read-only).
- **US-1603**: An owner invites a platform admin by email and sets the role; the last owner can't be removed.
- **US-1604**: I see AI cost and tokens by agency, purpose and model for any period, and set an agency's monthly AI budget.
- **US-1605**: Every `/admin` action is listed with who, when, which agency and what; entries never include candidate or client content.
- **US-1606** (release 2): Queue and outbox failures and AI error/refusal rates per agency (counts and ids only); the AI routing table, prompt versions, default templates and feature flags.
- Support access to an agency's workspace stays in **US-1305** (release 2), which requires the agency admin's approval.

### E14: Hiring manager portal

#### US-1404: HM reviews submissions (Must, M)
```
As a hiring manager,
I want to see the candidates my recruiter submitted, with the report and resume,
So that I can decide quickly without digging through email.
```
- Given I'm invited to position "HR Director", when I open the portal from the email link on my phone, then I see the submitted candidates with report and resume, and nothing else (no scores, no unsubmitted candidates, no recruiter notes).
- Given a candidate's submission is withdrawn, it disappears from my view.

#### US-1401 / 1402 / 1403 / 1405 / 1406
- **US-1401**: Recruiter invites a client contact; the invite is single-use and expiring; the HM sees only positions shared with them.
- **US-1402**: HM opens the improved JD, approves or requests changes with comments; the recruiter is notified and FR-INT-10 is satisfied.
- **US-1403**: HM fills the intake questionnaire; the answers appear in the intake record marked "from HM" for recruiter review.
- **US-1405**: HM chooses Interview / Hold / Reject (reason) and, after an interview, rates Technical / Leadership / Communication / Cultural / Industry. The decision arrives as a proposal; the pipeline status changes only when the recruiter confirms (always, DP-1).
- **US-1406**: HM proposes interview slots; the recruiter confirms with the candidate.

### E15: Candidate portal

#### US-1502: Candidate approves resume (Must, S)
```
As a candidate,
I want to review how my resume will be presented and approve it or ask for changes,
So that nothing goes to an employer without my agreement.
```
- Given my recruiter shared a tailored resume, when I open the link, then I can compare it with my original, approve, or request changes with comments.
- Approval is recorded with time; the recruiter is notified; submission is now allowed.

#### US-1503: Candidate consent (Must, M)
- Given a recruiter wants to submit me to "Acme Corp", when I am asked, then I see the client name and role and can consent or decline; without consent the submit step is blocked (configurable).
- I can withdraw consent; the recruiter is notified.

#### US-1501 / 1504 / 1505
- **US-1501**: Recruiter invites a candidate; the identity is separate per agency (⚠ Q-26).
- **US-1504**: Candidate updates contact, availability, compensation expectation, work authorization; the changes arrive as proposals the recruiter accepts.
- **US-1505**: Candidate sees the status of their own submissions at the level the agency allows; no client feedback text unless the recruiter shares it.
- **US-1507**: Candidate requests data export or deletion; the request reaches the agency with a tracked deadline; the candidate sees its progress.

## INVEST check

- Stories are independent within an epic except the stated chains (US-103 → US-107 → US-302 → US-801).
- Each Must story is testable through the scenarios above.
- Large stories (US-003, US-302, US-701, US-801, US-1101, US-108, US-1301) should be split in Planning (e.g., US-302 into single vs batch, evidence links, must-have display).
