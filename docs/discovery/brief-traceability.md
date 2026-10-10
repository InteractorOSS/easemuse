# Brief traceability audit (init.docx)

Audit of the implemented product against every section of `init.docx`, done for goal G#5 on 2026-10-08. Method: each bullet, field and list item of the brief was checked in the Prisma schema, zod schemas, AI prompts, services, API routes and the page/component UI. A field with no screen counts as Partial. Open deviations are in `open-questions.md` (Q-35 to Q-40) and need the product owner's confirmation.

## Result

All items of §3 to §14 are covered, with the exceptions below. The §1.1 principles hold in code: no scheduler calls the AI, no message is sent without a recorded user action, no code path filters by score, AI output is a draft until approved, resume facts are fact-checked.

| Brief § | Gap found | Resolution |
|---|---|---|
| §3.3 | A whole-document "improved JD" draft was specified; only per-suggestion edits to the structured JD exist, and the `jd.improve` / `improved_jd` stubs are unused | **Open**: Q-35, build or approve the deviation |
| §4.2 | Candidate education is extracted but could not be seen or edited | Fixed: education section in the profile editor and read-only view |
| §5.1/5.2 | Each criterion's weight was not shown beside its score | Fixed: shown on the analysis view |
| §7.3 | "Company / Business Opportunity" had no data behind it | Fixed: client name and an optional client description reach the draft prompt (`outreach-draft-v3`) |
| §7.3 | One-sided compensation ranges read badly (`100000- USD`) | Fixed: `formatCompensation` |
| §8 → §10 | Six of the 12 confirmed qualification topics had no place in the submission report | Fixed: code-rendered qualification summary in the report, editor and PDF (older versions still render) |
| §11 | Interview rounds could not be rescheduled or edited in the UI | Fixed: edit form on the round card |
| §15③ | The hiring manager could not propose a hiring decision (select for offer) | Fixed: new `offer` decision, still only a proposal the recruiter confirms |
| Navigation | Orphan artifact page, stub workbench home | Fixed: page removed, workbench home shows today's tasks, new "Today" nav item |
| §9.2 | One approval covers resume and profile | Open: Q-37 |
| §1.1 | Upload triggers AI drafting; daily embeddings go to an external service | Open: Q-36, documented |
| §4.3 | Portfolio scores only open positions with an approved success profile | Open: Q-38 |
| §1.1 | Performance is measured per position, not per candidate or document | Open: Q-39 |
| UI language | 17 of 19 Korean catalogs are empty (ADR-015, Q-08) | Open: Q-40 |

## Not done

- No screen edits the description of an existing client (the API accepts it).
- The hiring manager portal does not show the new qualification summary, because its submission snapshot is a strict section-by-key schema. The PDF does.
- Hiring manager feedback history is available on the client history page, not on the review board.
