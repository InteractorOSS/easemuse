# ADR-007: Match scoring method

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

Brief §5.1 defines a weighted model (Core Competencies 40, Relevant Experience 20, Industry/Functional 15, Career Level/YoE 10, Location/Work Arrangement 5, Education/Certification 5, Compensation/Other 5), with weights adjustable per position. Brief §5.2 asks for an overall match score that shows its grounds (strong match points, potential gaps) and that the recruiter can edit, with edits recorded. Brief §1.1: the score sets review order and is never a filter. Legal exposure (ER-001) and stability (TR-010) favour explainable, reproducible scoring.

## Considered options

1. **The LLM returns an overall score.** Simple, but opaque, unstable between runs, and can't be recomputed when weights change.
2. **The LLM scores each criterion with evidence; code computes the weighted overall score.** Chosen.
3. **Pure deterministic matching** (keyword/taxonomy overlap). Stable, but poor at judging responsibilities and achievements, which is what recruiters need help reading.

## Decision

**Option 2.**

- The A10 prompt receives the confirmed success profile (requirements by category) and the approved candidate profile, with protected attributes redacted (FR-AI-09).
- For **each of the 7 criteria** it returns `level` (strong | partial | gap | unknown), `score` 0–100 on an anchored rubric (e.g., strong = 85–100 only if evidence covers all must-haves for that criterion), `evidence[]` (quotes with source references) and `toConfirm[]`.
- It also returns, per **must-have and disqualifying requirement**, a status of met / not_met / unknown with evidence (FR-MAT-03).
- **Overall** = Σ(weightᵢ × scoreᵢ) / 100, computed in code and rounded to an integer. Criterion inputs are stored, so changing weights recomputes the overall **without a new AI call** (analyses are not marked stale by a weight change). Analyses become stale only when the candidate profile or the success profile gets a new approved version (FR-MAT-07).
- Strengths and gaps for the dashboard come from criterion evidence, not free text.
- Generation settings for stability: fixed prompt version; criteria assessed in a fixed order; rubric anchors in the system prompt.
- Overrides (FR-MAT-04) are stored beside the computed value with a reason. The dashboard sorts by override if present, otherwise computed, and the recruiter's manual order wins over both.
- **Explain-only mode** (agency setting): hides numeric scores and shows levels only. This is the contingency for ER-001 and TR-010 (Q-06).

## Consequences

**Positive**: explainable (every point traces to evidence); reweighting is instant and free; variance is limited to criterion scores, which the eval can measure.
**Negative**: seven criterion judgements per call means a longer output. Mitigation: concise evidence (max 3 per criterion); batch jobs.

## Validation

- Stability test: the same pair run 5 times gives overall variance ≤ 5 points (TR-010 trigger).
- Paired-resume bias test (NFR-AI04): identical resumes except for name/age/gender signals must score the same.

## Related

ADR-004, ADR-005, ADR-006. Requirements FR-MAT-01…07, FR-AI-05, FR-AI-09, NFR-AI04; brief §1.1, §5; risks ER-001, TR-010.

## Decision record

| Date       | Author               | Action   |
| ---------- | -------------------- | -------- |
| 2026-10-06 | Claude (AI-assisted) | Created  |
| 2026-10-06 | Product owner        | Accepted |
