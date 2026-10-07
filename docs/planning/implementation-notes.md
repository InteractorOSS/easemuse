# Implementation notes (2026-10-07)

Choices made while building Release 1 where the brief or the planning documents left room. None changes a design principle of brief 1.1. Each is easy to change; please confirm or correct them. Approved answers belong in `docs/discovery/open-questions.md`.

## To confirm

| # | Choice | Why | Where |
|---|--------|-----|-------|
| 1 | Only **Priority** and **Potential** candidates can move from "screened" to "contacting". Hold and Not Qualified cannot. | Planning handoff section 3 says only those two continue to outreach. | `pipeline/service.ts`, `screening/service.ts` |
| 2 | A **blind resume** leaves out the name and contact details. Employers, titles and dates stay. | Changing them would break "never alter resume facts" (brief 9.1). A stricter blind resume (employers hidden) needs a decision. | `ai/prompts/resume-tailor.ts` |
| 3 | The tailored resume's **facts are copied by code** from the confirmed profile (employers, titles, dates, degrees); the model only writes the summary, the bullets and the skill order. | Makes "do not change or exaggerate facts" structural, on top of the fact check. | `resume-tailor.ts` |
| 4 | The first interview round added to a **submitted** candidate moves them to "interviewing"; a round added to a candidate on hold puts them back in play. | Adding a round is already the recruiter's explicit act. | `interviews/service.ts` |
| 5 | When accepted placements reach the position's openings the position becomes **filled**; if one falls through (declined after acceptance, reneged) it goes back to **interviewing**. | Brief 12 and FR-OFF-03 say "filled when openings are met" but not what happens afterwards. | `offers/service.ts` |
| 6 | Offer **reminders**: one open task at a time (the day after the resignation date, a week before the start, the day after the start); completing one schedules the next. | FR-OFF-02 names the moments; the one-open-task rule of the task engine decides the mechanism. | `offers/reminders.ts` |
| 7 | **Privacy requests** get a 45-day deadline (the longest common U.S. state period) and a reminder a week before. Leads and admins record them; only an admin carries them out. | FR-PLT-08 asks for deadline tracking, not the period. Korea's PIPA is shorter (10 days). | `core/schemas/privacy.ts` |
| 8 | **Deletion** removes files, artifacts (all versions), documents, match analyses and embeddings of the candidate and redacts personal text in audit rows (activity details, approver names, free-text reasons, messages to the candidate, interview comments). Pipeline transitions and stages stay. A stored original that another candidate also uses is kept. | ADR-016, plus a decision on which free-text fields count as personal. | `privacy/anonymize.ts` |
| 9 | The opt-out link in an outreach email **suppresses the address and marks every matching candidate do-not-contact**. | FR-MSG-05 and FR-SRC-09 link them; marking the candidate also blocks drafting. | `messaging/unsubscribe.ts` |
| 10 | Outreach and report drafts use **placeholders** for names (`{{first_name}}`, `{{recruiter_name}}`) filled by code at preview, copy and send. The report text says "the candidate"; the PDF header shows the name. | Keeps the candidate's name away from the model (FR-AI-09). | `outreach/service.ts`, `ai/prompts/report-draft.ts` |
| 11 | A submission needs an **up-to-date PDF of both the report and the resume**, and pins those exact files. Submitting the same candidate to the same client again asks for a reason. | US-802 and FR-SUB-04. | `submission/submit.ts` |
| 12 | The candidate's **approval of the resume is bound to the exact approved version**: approving a changed version creates a new record that has no approval yet. | FR-RES-03: an approval must not cover text the candidate did not see. | `artifacts/hooks.ts`, `resume/approval.ts` |

## Running things

- **Database roles:** `pnpm db:setup` now also creates `easemuse_datarights`, the only login that can change audit rows. The worker needs `DATABASE_URL_DATARIGHTS` for candidate deletion (see `.env.example`); the job refuses to run without it.
- **AI evaluation:** `pnpm eval -- --suite all --max-cost 15` runs the labelled data in `eval-data/` against the real model (needs `ANTHROPIC_API_KEY`; see `apps/web/evals/README.md`). Nothing has been run against a live model yet.
- **Print pages in a real browser:** see the header of `src/server/documents/render/live-render.db.test.ts`. The JD, resume and report pages have been printed with Chrome against a dev server and look right.
- **Not built:** SMTP transport (postponed on request), Korean translations (skeleton only, per ADR-015), a logo on documents, a Playwright happy path (the loop is covered by `src/server/happy-path.db.test.ts` at service level, and axe runs on the screens at component level).
