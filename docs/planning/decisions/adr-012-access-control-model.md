# ADR-012: Access control model

## Status
Accepted (2026-10-06, product owner)

## Date
2026-10-06

## Context
Three authorization layers are required (FR-PLT-02): agency (tenant), client within an agency, and role/ownership among recruiters. There are also portal audiences (ADR-003) and platform administrator support access (FR-TEN-07). product-manager uses route wrappers (`authorizeOrg`, `authorizeOrgWithRole`) that resolve membership per request and return 404 to non-members, plus a guard test that every route classifies its auth.

## Decision
- **Route wrappers** (product-manager pattern): `authorizeAgency(req, {roles?})` → `{actor, agencyId, role}` and opens `withAgency` (ADR-001). `authorizePortal(req, {audience})` and `authorizePlatformAdmin(req)` are separate. Every route is classified (`agency | portal | ops | public`), and a guard test fails on unclassified routes. Public write routes must be rate-limited.
- **Roles** (per agency): `admin` (settings, users, billing, data-rights actions), `lead` (sees all positions in the agency; reassigns), `recruiter` (default visibility per agency setting: `all_positions` or `own_and_shared`).
- **Ownership:** `Position.ownerId` and `PipelineEntry.ownerId`; owner-only actions (approve, send, submit, transition) are also allowed to leads and admins. Collaborators can be added later; out of release 1.
- **Client-confidential fields** (compensation ranges, HM feedback, recruiter assessment) are hidden from recruiters without access to that position, and never published to portals unless explicitly part of a snapshot.
- **Capability checks live in services** (e.g., `submission.create` checks the actor's capability), not only in routes, so jobs and portal actions go through the same checks.
- **Platform administrators** (`/admin`, FR-ADM): `User.platformRole` = `owner` (manages platform admins), `admin` (agencies, budgets, configuration) or `support` (read-only metadata). MFA required. `/admin` reads platform tables and aggregate views only. No agency data access by default. A `SupportAccessGrant` (admin-approved, time-limited ≤ 72h, reason required) allows read-only access to that agency. Every request is logged to the agency's activity log, visible to the agency (FR-TEN-07).
- Unauthorized access to another agency's resource returns **404** (no existence disclosure); 403 is used for authenticated-but-insufficient role within one's own agency.

## Consequences
Consistent checks for web, jobs and portals; testable per role. A permission matrix test (role × endpoint) is required in CI.

## Related
ADR-001, ADR-002, ADR-003. FR-PLT-02, FR-TEN-03/07, NFR-S03/S07.

## Decision record
| Date | Author | Action |
|------|--------|--------|
| 2026-10-06 | Claude (AI-assisted) | Created |
| 2026-10-06 | Product owner | Accepted |
