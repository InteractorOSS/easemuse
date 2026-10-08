# ADR-016: Audit log, data rights and retention

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

The brief turns recruiting work into data (§1, §14) and requires recruiter edits to scores to be recorded (§5.2). Requirements: activity log (FR-PLT-03), AI provenance (FR-AI-03), audit export (FR-PLT-07), candidate export/delete (FR-PLT-08, FR-CDP-06) and tenant export/deletion (FR-TEN-06). KPIs must survive candidate deletion (FR-PLT-08 acceptance criteria).

## Decision

- **Append-only tables:** `ActivityLog`, `PipelineTransition`, `PositionTransition`, `LlmCall`, `Approval`, `Consent` (giving and withdrawing consent are separate rows). `AiGeneration` is **not** append-only, because its status moves from running to succeeded/failed/cancelled; its input refs and output are immutable once set. The application role has INSERT/SELECT only on them (no UPDATE/DELETE grants), except through the data-rights job (below).
- Activity entries store a summary (`data`: changed field names, old/new for non-sensitive fields) and never raw documents or full candidate text.
- **Candidate export:** a job assembles all candidate rows, artifact versions and files into a ZIP (JSON + originals) for the admin, logged.
- **Candidate deletion (anonymization):** a job (1) deletes the candidate's `FileBlob` rows (originals, ADR-010) and generated files (ADR-011); (2) deletes artifact versions whose subject is the candidate and the candidate's documents and embeddings; (3) replaces PII on `Candidate` (name → "Deleted candidate", contact fields null) and redacts PII inside `ActivityLog.data`; (4) **keeps** `PipelineTransition` and aggregate fields (source, stages, dates), so KPIs remain correct. This job is the only code path with UPDATE rights on audit tables (separate DB role).
- **Retention:** per-agency setting for inactive candidates (default: prompt for consent renewal at 24 months, per Q-17 default; counsel to confirm).
- **Tenant export/deletion:** a full export job; deletion after contract end runs an **explicit per-table delete job** in dependency order (not a database cascade: most agency tables have no relation to `Agency`), then deletes files and finally the `Agency` row. A guard test fails if any table with `agencyId` is missing from the job's table list. The job keeps a platform administrator-side deletion record.

## Consequences

Strong audit trail, and deletion that doesn't break analytics. The anonymization job needs careful tests (fixture candidate with data in every table).

## Related

ADR-001, ADR-006, ADR-010. FR-PLT-03/07/08, FR-TEN-06, FR-CDP-06, NFR-S04/S06.

## Decision record

| Date       | Author               | Action   |
| ---------- | -------------------- | -------- |
| 2026-10-06 | Claude (AI-assisted) | Created  |
| 2026-10-06 | Product owner        | Accepted |
