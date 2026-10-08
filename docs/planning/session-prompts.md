# Prompts for the remaining sessions

Start each session in the repo root. Run them in order A, B, C, D (B can run any time after A's branding task). Each prompt is self-contained: it points at the handoff note and the task list, names the tasks, and says when to stop.

## Session A: finish release 1 and the rest of release 2 (non-commercial)

```
Read docs/planning/HANDOFF.md, then docs/planning/tasks.md (the progress notes at the top and the Release 2 tables), docs/planning/implementation-notes.md and the ADRs the tasks cite. The brief is init.docx.

Work through these tasks in this order, autonomously, without asking me; you make any decision the brief leaves open and record it in implementation-notes.md:
1. T-11-01 to T-11-05 (analytics: the 9 KPIs with the formulas in docs/discovery/planning-handoff.md section 6, the source table, the capacity panel, the page, CSV export).
2. T-14-07, T-15-01, T-14-08 (portal notifications, candidate status share, portal adoption KPI).
3. T-9-03 (prompt A17), T-3-12 (re-analyse button on stale analyses), T-2-13 (tags and notes), T-2-14 (bulk resume upload), T-2-15 (CSV import), T-5-11 (outreach templates).
4. T-5-02 (SMTP transport, selectable per agency) and T-5-12 (real mail provider with reply sync). If the provider credentials are missing, build everything behind the transport interface with the dev transport and a documented configuration, and tell me exactly what to provide.
5. T-QA-09 (run the AI evals that are still open: pnpm eval -- --suite jd-structure,stability) only if the Anthropic key has credit; if it does not, skip it and say so.
6. T-QA-06 (Playwright happy path with a test-only sign-in and an AI stub that cannot be enabled in production).

Follow the rules in HANDOFF.md exactly: pnpm check must pass before every commit, commit in logical chunks with the required attribution, never push, never read .env.local, check each feature against the brief section it implements. Update the progress notes and the Status column in tasks.md as you finish tasks. Stop when all of the above is done or blocked, and give me a short report: what is built, what I must provide, what you decided.
```

## Session B: release 2 commercial and platform

```
Read docs/planning/HANDOFF.md, then docs/planning/tasks.md (section "E13 / E16: Commercial and platform"), ADR-013 (billing and metering), ADR-014 (use of Interactor services), ADR-016 (audit log and data rights), ADR-012 (access control) and docs/discovery/requirements.md FR-TEN-04..07, FR-ADM-07..10. The brief is init.docx; none of this section is in the brief, it comes from the product owner's SaaS decisions, so keep it minimal and exact.

Build T-13-06 (agency branding editor, used by PDFs, portals and emails, with the logo drawn on documents), T-13-07 (support access grants), T-13-09 (tenant export), T-13-10 (tenant deletion with a second owner's approval and the table-coverage guard test), T-16-01 (system health), T-16-02 (platform configuration), T-14-06 (logo in portal and emails), then T-13-08 (plans, seats and usage through the Interactor Billing Server) and T-SEC-01 (write the DPA, terms and sub-processor list as documents; the pen test is something I arrange, list what to hand the tester).

For the Billing Server I will provide credentials; until then build against an interface with a recording fake and a documented configuration, and tell me what is needed. Never weaken the isolation rules: every new table has RLS, every new route is in the permission matrix and the isolation test, and support access must show a banner and log every view in both the platform audit log and the agency's activity log.

Follow HANDOFF.md exactly (pnpm check before each commit, required attribution, no push, never read .env.local). Update tasks.md as you go. End with a short report: what is built, what I must provide, what you decided.
```

## Session C: release 3 reuse and history, portal extras

```
Read docs/planning/HANDOFF.md, then docs/planning/tasks.md (section "E12: Experience reuse" and "E14 / E15: Portal extras"), brief section 14 in init.docx (read it in the original Korean), docs/discovery/requirements.md FR-KNW-01..03, FR-HMP-03, FR-HMP-06, FR-CDP-04, and ADR-006 and ADR-007.

Build T-12-01 to T-12-05 (client history, "what has this client liked before", pattern reports for the seven section 14 questions, prompt A18 with evidence links and fact check, and the guardrails) and T-14-09, T-14-10, T-15-02 (HM online intake, interview slot proposals, candidate self-updates as proposals).

The brief is explicit: the point is that the recruiter's experience and the client's feedback are kept and can be found again, not that AI learns or judges by itself. So: every number shows how many records it comes from, small samples are flagged, AI summaries are drafts with a link to the record behind every statement, and no protected characteristic ever appears in a pattern (the seventh question is about job-related characteristics only; add eval cases and tests that prove it). Anything that comes from a portal arrives as a proposal the recruiter accepts.

Follow HANDOFF.md exactly. Add the new routes to the permission matrix and the isolation tests, and the new screens to the axe tests. Update tasks.md. End with a short report: what is built, what I must provide, what you decided.
```

## Session D: release 3 pool intelligence and benchmark

```
Read docs/planning/HANDOFF.md, then docs/planning/tasks.md (section "E2 / E1: Pool intelligence and benchmark"), ADR-008 (embeddings and pool search), ADR-005 (model selection, web search for benchmarking), ADR-004 and ADR-013 (cost and budgets), and docs/discovery/user-stories.md US-108, US-205, US-206.

Build T-2-16 (Voyage embeddings in the AI gateway with an indexing job when a profile is approved, metered like every other AI cost), T-2-17 ("Find in my pool", up to 25 candidates with one-line reasons, nothing added until the recruiter adds), T-2-18 ("Check open positions" for a candidate), T-1-15 and T-1-16 (benchmark with a web search step and an own-data step, source URL and date on every item, "Our data" kept apart from "Web", no paid sources, suggested JD changes accepted one by one).

Rules: search results are suggestions, never a ranking that hides anyone (scores are reference only); candidate names and contact details never go to Voyage or to any model; a benchmark is a draft until the recruiter approves it, and web items that cannot be cited are dropped. The Voyage key and the web search tool need configuration: put the Voyage key where the Anthropic key lives (admin settings, stored encrypted) and fall back to the environment. If keys are missing, build against fakes, keep the live paths behind configuration, and tell me exactly what to provide. Add eval cases to apps/web/evals for the similar-candidate reasons and the benchmark citations, and run them only if the keys have credit.

Follow HANDOFF.md exactly. Add the new routes to the permission matrix and the isolation tests, and the new screens to the axe tests. Update tasks.md. End with a short report: what is built, what I must provide, what you decided.
```
