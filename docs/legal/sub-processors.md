# EaseMuse sub-processors

**Draft 2026-10-07, for counsel review.** This list is attached to the Data Processing Agreement. "In use" means the product calls the service today; "Planned" means it is in the plan but not built or not switched on, and no customer data goes there until it is. Team of Wakers gives customers [30] days' notice before adding or replacing a sub-processor that handles customer data.

| Sub-processor | What it does for EaseMuse | Customer data it receives | Where | Status |
|---------------|--------------------------|---------------------------|-------|--------|
| Anthropic, PBC | Language model for AI drafts the user asks for: job description structuring, candidate profile structuring, match analysis, outreach drafts, qualification notes, tailored resume text, submission report text, fact checks. Also reads scanned PDFs that have no text layer. | Text of job descriptions, resumes and notes that the user chose to run. **Reading a resume necessarily sends the resume text**, which can include the candidate's name and contact details; protected characteristics (age, gender, nationality and similar) are removed from that text first. Later steps (match analysis, outreach, report drafts) are built without names and contact details, which code fills in afterwards. Scanned PDFs are sent as the document itself. | United States [confirm] | In use. Requires a signed DPA and a zero-retention / no-training setting [to confirm with Anthropic, NFR-S05] |
| Interactor, Inc. (Account Server) | Sign-in for agency users and platform administrators (OpenID Connect), multi-factor authentication | Name and email of staff, the sign-in subject id | [Interactor to confirm] | In use |
| Interactor, Inc. (Billing Server) | Plans, seats and AI usage for invoicing agencies | Agency id, plan, seat count and AI cost totals. No candidate or client content | [Interactor to confirm] | Planned: built against an interface; switched on when credentials are provided (T-13-08) |
| Voyage AI | Embeddings for "find in my pool" and "check open positions" | Text of an approved candidate profile or success profile, **without name or contact details** | United States [confirm] | Planned (release 3, ADR-008). Product owner approved it as a sub-processor (Q-34) |
| [Hosting provider] | Runs the web app, the worker, PostgreSQL (with pgvector), Redis and object storage | Everything the agency stores, encrypted at rest | [region, set per agency at creation: U.S. default] | In use [Team of Wakers to complete: provider, region, certifications] |
| [Email provider] | Delivers the emails a recruiter sends to candidates and the invitations to the portals | Recipient address, subject, body | [region] | Planned. Today emails are captured in the outbox and not delivered (SMTP postponed, T-5-02) |
| [Error monitoring and product analytics, if adopted] | Error reports and usage events | Ids and event names only; personal data is scrubbed | [region] | Not in the product today. The build plan names Sentry, PostHog and Logtail; they would be added here before use |

## What is not a sub-processor

- **Interactor userdb** is not used: documents stay in EaseMuse's own database (Q-34, ADR-010).
- **Hiring managers and candidates** who use a portal are people the agency invited. They are data subjects or the agency's clients, not our processors.

## Changes

| Date | Change |
|------|--------|
| 2026-10-07 | First draft |
