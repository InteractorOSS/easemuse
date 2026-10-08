# ADR-003: Portal architecture for hiring managers and candidates

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

Hiring managers must see **only** candidates submitted to them: report, tailored resume and status. They must never see match scores, unsubmitted candidates or recruiter notes (FR-HMP-04). Candidates see only their own data (FR-CDP-01). A portal leak is risk TR-005. Brief §15 separates roles: the recruiter works the process; the hiring manager reviews and decides.

## Decision drivers

- Leak resistance for portal audiences
- Reuse of domain logic (approvals, feedback, consent)
- Mobile-first, agency-branded UX
- One deployable (ADR on architecture style)

## Considered options

1. **Filter the recruiter API by audience.** Least code, but every new field is visible to portals unless someone remembers to hide it. Rejected.
2. **Separate portal app.** Strong separation, but a second deployable and duplicated auth and UI infrastructure. Rejected for now.
3. **Same Next.js app, separate route groups and a separate portal API reading published snapshots (`PortalShare`).** Chosen.

## Decision

**Option 3.**

- Routes: `(portal-hm)/h/[agencySlug]/…` and `(portal-candidate)/c/[agencySlug]/…`. API: `/api/portal/v1/:agencySlug/…`.
- **Reads come only from `PortalShare.snapshot`**: a JSON document built by the recruiter-side "publish/share" action from **approved** artifact versions, and validated by a portal zod schema that whitelists fields. Portal routes never import recruiter-side query modules (import-boundary lint rule).
- **Writes** (approve, request changes, intake answers, feedback, decision proposal, consent, privacy request) call domain services with a `PortalActor` whose capabilities are fixed per audience. HM decisions create `ProposedTransition` rows only (FR-HMP-05).
- Revoking a share (e.g., a withdrawn submission) sets `revokedAt`, and the portal stops showing it immediately.

## Consequences

**Positive**: a portal can only show what was explicitly published, field by field; snapshots also record exactly what the HM saw and when (audit).
**Negative**: snapshots can go stale if the recruiter edits after publishing. Mitigation: publishing a new approved version creates a new snapshot, and the HM sees "updated on…".
**Neutral**: portal UI reuses the `components/ui` primitives with agency theme tokens.

## Implementation notes

- `server/portal/publish.ts` builds snapshots: `submission` (report sections 1–14, tailored resume file link, status label), `jd_for_approval`, `intake_form`, `tailored_resume` (candidate), `status` (candidate).
- File access in portals goes through `/api/portal/v1/files/:shareId/:fileId`, which checks that the share includes the file.
- Release 1 builds the publish service and snapshot schemas behind the recruiter UI (used for PDF content). Portal routes ship in release 2.

## Related

ADR-002, ADR-012. Requirements: FR-HMP-01…07, FR-CDP-01…07, FR-SUB-02; risk TR-005.

## Decision record

| Date       | Author               | Action   |
| ---------- | -------------------- | -------- |
| 2026-10-06 | Claude (AI-assisted) | Created  |
| 2026-10-06 | Product owner        | Accepted |
