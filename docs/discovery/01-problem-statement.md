# Step 1: Problem Statement

| Field       | Value                                    |
| ----------- | ---------------------------------------- |
| **Project** | EaseMuse AI-Assisted Recruiter Workbench |
| **Version** | 0.2 (P0 answers applied 2026-10-06)      |
| **Date**    | 2026-10-06                               |
| **Status**  | Draft, awaiting stakeholder review       |

---

## 1. Background

Agency recruiters (the brief describes EaseMuse's intended users) run searches for client companies end to end: they take the hiring request, sharpen the JD, find candidates (mostly by hand on LinkedIn and similar sources), compare them to the role, reach out, qualify interested candidates by phone, tailor resumes, write submission reports for the hiring manager, coordinate interviews, and carry the chosen candidate through offer to start date.

The brief describes one agency's recruiters, but the product will be **sold as SaaS to other recruiting agencies** (decision 2026-10-06). The problem below applies to any third-party recruiting agency; EaseMuse is the product, owned and maintained by **Team of Wakers**; the first customer is **Team of Wakers' own internal use** (tenant #1, Q-29).

Today that work lives in recruiters' heads, inboxes, spreadsheets and documents. The brief names the cost directly: work depends on "the recruiter's personal memory and manual effort", and a large share of a recruiter's time goes to reading, organizing, comparing and writing rather than to the judgement-heavy work (talking to candidates, assessing them, managing clients).

## 2. Problem

> Recruiters spend a large share of each search on reading, organizing, comparing, writing and tracking, and what they learn (about candidates, clients and what worked) is not captured anywhere reusable. This caps how many positions one recruiter can run and loses knowledge between searches.

Specific symptoms (from the brief):

| #   | Symptom                                                                                     | Where in the process       |
| --- | ------------------------------------------------------------------------------------------- | -------------------------- |
| P1  | Client JDs are vague or incomplete; must-haves vs nice-to-haves are unclear                 | Intake                     |
| P2  | Each resume has to be read and mentally compared to the role by hand                        | Sourcing, Matching         |
| P3  | Candidates found for one search aren't systematically reconsidered for later ones           | Talent pool                |
| P4  | Personalized outreach and multi-step follow-up is slow to write and easy to drop            | Outreach                   |
| P5  | Phone qualification notes are unstructured and re-typed into reports                        | Qualification, Submission  |
| P6  | Tailored resumes and submission reports are written from scratch each time                  | Resume prep, Submission    |
| P7  | Interview, feedback and offer status are tracked manually; follow-ups get missed            | Interview, Offer           |
| P8  | No data on what works (sources, profiles, JDs, drop-off stages, hiring manager preferences) | Analytics, Knowledge reuse |

## 3. Who is affected

| Who                                                                        | Effect today                                                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Recruiters (primary users)                                                 | Time lost to admin and writing; limit on parallel positions; knowledge stuck in individual memory                                  |
| Client hiring managers                                                     | Receive inconsistent submissions; wait longer; get less explanation of why a candidate fits                                        |
| Candidates                                                                 | Generic outreach; slow or dropped follow-up; resumes not presented at their best                                                   |
| Recruiting agencies (customers; Team of Wakers' internal use is the first) | Revenue per recruiter capped; knowledge leaves when a recruiter leaves                                                             |
| Team of Wakers as vendor                                                   | Opportunity: a recruiter-led AI workbench for agencies, as opposed to tools where AI sources and contacts candidates automatically |

## 4. What the product is, and is not

**Is**: an _AI-Assisted Recruiter Workbench_, sold as multi-tenant SaaS to recruiting agencies, with portals where hiring managers and candidates take part. One system manages the end-to-end process:

`Job requirement analysis → Candidate sourcing → Matching analysis → Recruiter assessment → Candidate engagement → Client submission → Interview → Hiring`

**Is not**:

- An AI that finds and recommends candidates on its own
- A plain ATS (applicant tracking system) or candidate database
- An automated outreach / spam tool
- A system that filters or rejects candidates automatically

## 5. Design principles (from the brief, binding on all requirements)

| ID   | Principle                                     | What it means for the product                                                                                                                       |
| ---- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| DP-1 | **Recruiter leads, AI assists**               | All decisions on sourcing, selection, contact and recommendation are made by the recruiter. AI prepares material.                                   |
| DP-2 | **No automatic execution**                    | AI runs only when the recruiter asks. AI never searches for candidates, sends messages, or rejects candidates by itself.                            |
| DP-3 | **AI output is a draft**                      | Every AI output (JD structure, match analysis, outreach copy, reports) is a draft; it becomes final only after the recruiter edits and approves it. |
| DP-4 | **Scores are reference only**                 | Match score sets review _order_, not a cut-off. The recruiter can advance or hold anyone regardless of score. Score edits are recorded.             |
| DP-5 | **Measure recruiter capacity, not AI output** | Success = positions per recruiter and time per position.                                                                                            |
| DP-6 | **Never alter facts** (from §9.1)             | Resume tailoring changes wording and structure only, never facts. Original resume is always kept.                                                   |

## 6. Goals

| ID  | Goal                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Increase the number of positions one recruiter can actively manage                                                                                                          |
| G2  | Reduce recruiter time per position, especially on reading and writing tasks                                                                                                 |
| G3  | Turn intake into a clear Candidate Success Profile that the hiring manager has confirmed                                                                                    |
| G4  | Make the talent pool reusable across searches                                                                                                                               |
| G5  | Give hiring managers explainable submissions (why this candidate fits, what the gaps are)                                                                                   |
| G6  | Keep the pipeline moving: no dropped follow-ups through to the start date                                                                                                   |
| G7  | Capture recruiter experience and client feedback as data that can be searched and reused                                                                                    |
| G8  | Let hiring managers and candidates act directly (approve JD, review submissions, give feedback; approve resume, consent) so the recruiter stops relaying documents by email |
| G9  | Be a sellable product: agencies can sign up, configure their workspace and be billed, with their data fully isolated                                                        |

## 7. Success metrics

The brief defines the primary metrics (DP-5) but not baselines or targets. Targets below are **placeholders** to be agreed (see [open-questions.md](./open-questions.md) Q-11). A baseline must be measured before launch (2–4 weeks of time logging on current searches) or the outcome can't be shown.

| Metric                                           | Type                    | Baseline      | Target (proposed)                                                                  | How measured                                             |
| ------------------------------------------------ | ----------------------- | ------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Active positions per recruiter                   | Primary                 | TBD (measure) | +50% within 6 months of adoption                                                   | Positions in an open status per recruiter, weekly        |
| Recruiter hours per position (open → submission) | Primary                 | TBD (measure) | −30%                                                                               | Time-tracking sample before and after; system timestamps |
| Time to produce a submission report              | Secondary               | TBD           | < 20 min recruiter time                                                            | Draft created → report approved                          |
| Time to structure a JD + intake                  | Secondary               | TBD           | < 30 min                                                                           | Position created → success profile confirmed             |
| Outreach response rate                           | Outcome                 | TBD           | No decrease vs baseline (then improve)                                             | Responses / candidates contacted                         |
| Submission-to-interview rate                     | Outcome (quality guard) | TBD           | No decrease vs baseline                                                            | Interviews / submissions                                 |
| Time-to-fill                                     | Outcome                 | TBD           | −20%                                                                               | Position opened → offer accepted                         |
| AI draft acceptance                              | Product health          | n/a           | Tracked, no target                                                                 | % of AI drafts approved with light vs heavy edits        |
| Talent pool reuse                                | Product health          | 0             | ≥ 20% of submissions come from candidates sourced for an earlier position          | Candidate's first position ≠ submitted position          |
| Portal adoption                                  | Product health          | 0             | ≥ 70% of JD approvals, submission reviews and resume approvals done in the portals | Actions in portal ÷ all such actions                     |
| Paying agencies / seats                          | Business (SaaS)         | 0             | TBD with sponsor (Q-27, Q-30)                                                      | Billing records                                          |

Quality guard: capacity gains only count if submission-to-interview and offer-acceptance rates do not fall.

## 8. Assumptions (to validate)

| ID  | Assumption                                                                                                                                                                          | How to validate     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| A1  | ~~One agency's recruiters only~~ → **Resolved**: multi-tenant SaaS for many agencies (Q-01). Still to confirm: no sharing of talent pools between agencies (Q-22)                   | Q-22                |
| A2  | ~~HMs and candidates don't log in~~ → **Resolved**: both log in through portals (Q-02, Q-03). Recruiters can still record actions on their behalf when someone won't use the portal | Q-24, Q-25          |
| A3  | Most resumes and JDs are in English; **U.S. is the main market, Korea possible later** (Q-07 answered)                                                                              | Q-08                |
| A4  | ~~Recruiter sends outside the system~~ → **Resolved**: the recruiter sends from inside the app (one click per message); real mail provider connected later (Q-04)                   | —                   |
| A5  | No automated scraping of LinkedIn or other sites (explicitly out of scope in §4.1)                                                                                                  | Confirmed by brief  |
| A6  | Web desktop is the main surface; mobile is not needed for the first release                                                                                                         | Q-09                |
| A7  | Recruiter time on reading and writing is large enough that AI drafting makes a measurable difference                                                                                | Baseline time study |

## 9. Consequences of not solving it

Recruiter capacity stays capped by manual work, hiring managers keep getting uneven submissions, and each search starts from zero because past candidates and client feedback aren't findable.
