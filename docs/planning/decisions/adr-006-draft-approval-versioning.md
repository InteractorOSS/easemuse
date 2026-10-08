# ADR-006: Draft → approve versioning for AI-touched artifacts, and the fact check

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

Brief §1.1: "All AI results (JD structuring, match analysis, outreach copy, reports) are drafts, final only after the recruiter edits and approves." Brief §9.1: tailoring must not change or exaggerate facts, and the original resume is preserved. Sixteen artifact kinds share this lifecycle (schema `ArtifactKind`), and downstream features must use only approved content (FR-AI-02). Portal approvals (JD by HM, resume by candidate) must point at the exact version shown.

## Considered options

1. **Per-domain draft columns** (e.g., `Position.structuredJdDraft`, `structuredJdApproved`). Simple per table, but sixteen different implementations, no shared history, and easy to read a draft by mistake.
2. **Generic `Artifact` + `ArtifactVersion` + `AiGeneration`.** Domain rows point to an artifact; one approval service; full version history. Chosen.
3. **Event-sourced documents.** Powerful, but heavier than needed.

## Decision

**Option 2.**

- `Artifact(kind, subject, approvedVersionId)` and `ArtifactVersion(version, content, status, origin: ai|human|ai_edited, aiGenerationId, parentVersionId, factCheck)`.
- `content` is validated by the kind's zod schema (`packages/core`) on every write.
- **Read rule:** domain services read `approvedVersionId` only. A lint/guard test forbids reading `ArtifactVersion` rows with status `draft` outside the artifact module and **review surfaces**: the editor UI and the candidate review dashboard, which show drafts with an "AI draft" badge so the recruiter can review them.
- **Match analyses** are approved by the recruiter's "Mark reviewed" action (optionally after overrides and writing the recruiter assessment). Only reviewed analyses feed downstream features: call questions (A13) and the submission report (A16).
- **Approve** is a single service (`artifacts.approve(versionId, actor, resolutions)`). It checks kind-specific rules, then sets the pointer, marks the previous approved version `superseded`, writes the activity log, and marks dependent analyses stale where relevant (e.g., a new success profile marks match analyses stale, FR-MAT-07).
- **Kind-specific approve rules:**
  - `submission_report`: section 14 "Recruiter's Assessment" must be non-empty and is human-only. The AI never writes it, and a version whose section 14 came from AI is rejected.
  - `match_analysis`: `recruiterAssessment` is human-only.
  - `tailored_resume` and `submission_report`: all fact-check warnings must be resolved.
- **Fact check (X1)** runs on generated documents (A12, A15, A16). Step 1, deterministic: extract named entities and numbers (employers, titles, dates, team sizes, amounts) from the draft and match them against the approved profile and original document text. Step 2: an LLM verifier flags claims not supported by the source. Each warning must be resolved by editing or by confirming with a reason. Resolutions are stored in `factCheck`.

## Consequences

**Positive**: one tested lifecycle; complete provenance (who, which model, which inputs, what changed); portal approvals reference immutable versions.
**Negative**: polymorphic `subjectType/subjectId` has no database foreign key. Mitigation: service-level integrity checks and a nightly orphan report.
**Neutral**: edit distance between AI draft and approved version gives a draft-quality metric (BR-002).

## Related

ADR-004, ADR-007, ADR-003. Requirements FR-AI-02…06, FR-RES-01, FR-SUB-01, FR-MAT-05; brief §1.1, §9.1, §10; risk TR-002.

## Decision record

| Date       | Author               | Action   |
| ---------- | -------------------- | -------- |
| 2026-10-06 | Claude (AI-assisted) | Created  |
| 2026-10-06 | Product owner        | Accepted |
