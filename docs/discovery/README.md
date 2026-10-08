# EaseMuse Discovery: AI-Assisted Recruiter Workbench

**Status**: Draft (v0.2). P0 answers applied 2026-10-06 (SaaS, portals, in-app email, AI web-search benchmarking, U.S. first). Q-21 to Q-23 resolved with defaults. Remaining questions are P1/P2 in [open-questions.md](./open-questions.md)
**Source**: `init.docx`, "Recruiter 업무 지원 시스템 구축 제안서 / AI-Assisted Recruiter Workbench: 프로세스 및 기능", EaseMuse, October 2026 (written in Korean, translated and structured here)
**Last updated**: 2026-10-06

---

## What we are building, in one paragraph

A **multi-tenant SaaS** workbench, sold to recruiting agencies, that manages a recruiter's whole recruiting process for client companies in one place, with **portals for hiring managers and candidates**: client intake and job description (JD) analysis, sourcing and talent pool, matching analysis, screening, outreach, qualification, resume preparation, client submission, interviews, offer and closing, and analytics. AI helps with the reading, organizing, comparing, writing and tracking work. **The recruiter makes every decision; AI never acts on its own; every AI output is a draft until the recruiter approves it.** Success is measured by how many positions one recruiter can handle and how long each one takes, not by how many candidates the AI finds.

---

## Step-by-step discovery

Each step produces one document. Read them in order; each builds on the one before. Steps 1–6 are drafted from the brief. Step 7 is the package Phase 2 (Planning) starts from.

| Step | Discovery activity                                                                           | Document                                                     | Status                        |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| 1    | Problem definition: problem, goals, success metrics, principles                              | [01-problem-statement.md](./01-problem-statement.md)         | Draft                         |
| 2    | Stakeholder analysis: who uses, decides, is affected                                         | [stakeholders.md](./stakeholders.md)                         | Draft                         |
| 3    | User research: personas, journey, jobs-to-be-done, pain points                               | [03-personas-and-journeys.md](./03-personas-and-journeys.md) | Draft (needs real interviews) |
| 4    | Requirements: scope, functional requirements per system, non-functional requirements         | [requirements.md](./requirements.md)                         | Draft                         |
| 5    | User stories: epics, stories, acceptance criteria                                            | [user-stories.md](./user-stories.md)                         | Draft                         |
| 6    | Research: competitive landscape, technical feasibility, regulatory notes                     | [research-notes.md](./research-notes.md)                     | Draft (desk research)         |
| 7    | Open questions and decisions needed before planning                                          | [open-questions.md](./open-questions.md)                     | P0 answered; P1/P2 open       |
| →    | Planning handoff: domain model, workflow states, AI capability list, proposed release slices | [planning-handoff.md](./planning-handoff.md)                 | Draft                         |

### How to use this for Phase 2

1. All **P0 questions** are answered (see the decisions log and change record in [open-questions.md](./open-questions.md)). P1 questions get closed during Planning.
2. Confirm the **release slices** proposed in [planning-handoff.md](./planning-handoff.md#5-proposed-release-slices).
3. Run the validator on these documents, then `/start-planning`. Planning should take the domain model, pipeline state machine and AI capability list in [planning-handoff.md](./planning-handoff.md) as its starting point for the architecture document and ADRs.

---

## Discovery checklist

### Problem definition

- [x] Problem statement clearly articulated
- [x] Impact and scope defined
- [~] Success metrics identified (metrics defined; baselines and targets need stakeholder input, Q-11)
- [x] Assumptions documented

### Stakeholder analysis

- [x] All stakeholders identified (roles; names to fill in)
- [x] Roles and responsibilities defined
- [x] Communication plan established (proposed)
- [ ] Sign-off process defined (approvers to be named)

### Requirements gathering

- [x] Functional requirements documented (12 systems + cross-cutting AI and platform requirements)
- [x] Non-functional requirements defined (targets proposed, need confirmation)
- [x] Constraints identified
- [x] Dependencies mapped

### User research

- [x] User personas created (from the brief; validate with 3–5 recruiter interviews)
- [x] User journeys mapped
- [x] Pain points identified
- [x] Jobs-to-be-done documented

### Competitive analysis

- [x] Competitors identified (categories and examples)
- [x] Feature comparison completed (category level)
- [x] Differentiation strategy defined

### Technical feasibility

- [x] Technical constraints assessed
- [x] Integration requirements identified
- [x] Technology options evaluated (options listed; decisions belong in Planning ADRs)

---

## Exit gate to Planning

| Criterion                                   | Status                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Problem statement approved by stakeholders  | Pending review                                                                    |
| Requirements prioritized (MoSCoW)           | Done (proposed)                                                                   |
| Initial scope defined, including what's out | Done (proposed)                                                                   |
| Risks identified                            | Done ([research-notes.md](./research-notes.md#4-risks-surfaced-during-discovery)) |
| P0 open questions answered                  | Done (Q-01 to Q-07; Q-21 to Q-23 by default)                                      |
| Validator run on all discovery documents    | **Pass** (2026-10-06, see below)                                                  |
| Go/no-go decision                           | Pending                                                                           |

## Validation report (2026-10-06)

**Artifacts**: all documents in this folder, checked against `init.docx`. **Type**: Requirements. **Status**: PASS with known accepted gaps.

| Check                                                                                                       | Result                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Every requirement has acceptance criteria                                                                   | Pass                                                                                                                                           |
| Every Must requirement is covered by a user story; every Must story has acceptance criteria                 | Pass                                                                                                                                           |
| Every Must story is scheduled exactly once in a release; no release depends on a later one                  | Pass (fixed: do-not-contact moved to release 1; recruiter-recorded consent added for release 1)                                                |
| Cross-document links and IDs resolve                                                                        | Pass                                                                                                                                           |
| No contradictions with 2026-10-06 decisions (SaaS, portals, email, benchmarking, U.S. first, private pools) | Pass (fixed 6 leftovers from the internal-tool draft)                                                                                          |
| Design principles DP-1 to DP-6 respected                                                                    | Pass (fixed: HM decisions are always proposals the recruiter confirms; embedding of approved content documented as the only automatic AI step) |
| Fidelity to `init.docx`                                                                                     | Pass: every item the brief enumerates (§3.1–§14) appears in requirements (fixed: §14's 7th question added)                                     |
| Ambiguous wording in requirement statements                                                                 | Pass                                                                                                                                           |

**Known accepted gaps** (do not block Planning): no baseline for success metrics yet (time study needed); personas not yet validated by interviews; regulatory notes need counsel review; P1 questions in [open-questions.md](./open-questions.md) to close during Planning.
