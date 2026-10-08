# ADR-001: Multi-tenancy model and tenant isolation

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

EaseMuse (owned and maintained by Team of Wakers) is sold to many recruiting agencies (decision Q-01). Each agency holds candidate personal data, client compensation and hiring-manager feedback. A leak between agencies would be a critical incident (risk TR-001), both legally (privacy law, DPAs) and commercially. Talent pools are never shared between agencies (Q-22).

The reference codebase, Interactor product-manager, scopes tenants in application code only (an `organizationId` column checked in auth wrappers; no RLS, no Prisma tenant extension). Its own audit (`product-manager/docs/security/tenant-isolation-audit.md`) found **eleven leaking rows** in one sweep under that model.

## Decision drivers

- Zero cross-tenant access (FR-TEN-01, NFR-S08)
- Same stack and conventions as product-manager (Prisma 7.8 + pg adapter + pooled `pg.Pool`)
- Many small tenants (hundreds), not a few large ones
- Korea region later (FR-TEN-08) without a redesign
- Small team; operational simplicity

## Considered options

### Option 1: Shared schema, application-level scoping only (product-manager model)

**Pros**: simplest; proven in product-manager; no pooling subtleties.
**Cons**: one missed `where` leaks data; raw SQL (pgvector) and background jobs are easy to get wrong; demonstrated leaks in the reference codebase.
**Effort**: Low

### Option 2: Shared schema + agency-scoped Prisma client + Postgres row-level security (RLS)

**Pros**: database enforces isolation even when code forgets; fails closed when the agency context is missing; still one schema and one migration path; works for raw SQL too.
**Cons**: every query must run inside a transaction that sets `app.agency_id`; needs a non-owner DB role without `BYPASSRLS`; cross-agency platform administrator queries need a separate path.
**Effort**: Medium

### Option 3: Schema per agency

**Pros**: strong isolation; per-tenant restore.
**Cons**: hundreds of schemas × hundreds of migrations; Prisma doesn't handle dynamic schemas well; pooling per schema.
**Effort**: High

### Option 4: Database per agency

**Pros**: strongest isolation; per-region placement trivial.
**Cons**: cost and operations for hundreds of small agencies; cross-tenant analytics for the platform administrator become hard.
**Effort**: Very high

## Decision

**Option 2: shared schema + agency-scoped Prisma client + Postgres RLS**, with region chosen per deployment (a Korea region later is a separate deployment and database, not a schema change).

### Rationale

It keeps product-manager's simplicity (one schema, one Prisma client, one migration folder) and adds a database-level guarantee where product-manager's experience shows app-only scoping fails. Schema-per-tenant and DB-per-tenant cost too much for many small agencies.

## Consequences

### Positive

- A missing filter returns no rows instead of another agency's rows.
- Raw SQL for pgvector and full-text search is covered by the same policies.
- Isolation is testable at the database level.

### Negative

- Every request does `BEGIN; SELECT set_config('app.agency_id', $1, true); …; COMMIT`. Mitigation: the scoped client wraps each request's work in one interactive transaction. `set_config(..., true)` is transaction-local, so pooled connections can't carry context over (TR-007).
- Long-running work must open short transactions per step, never one giant transaction. Mitigation: the worker uses `withAgency(agencyId, fn)` per unit of work.
- Platform admin section (`/admin`) queries across agencies (agency list, usage roll-ups) need a separate role. Mitigation: a `easemuse_admin` role that can read only `Agency`, `Membership`, `LlmCall` aggregates and `SupportAccessGrant`, via security-definer views. Candidate tables are never readable by ops without a grant.

### Neutral

- Composite indexes lead with `agencyId` anyway (query performance), so RLS predicates are cheap.

## Risks

| Risk                                               | Impact   | Likelihood | Mitigation                                                                                                               |
| -------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Context leaks across pooled connections            | High     | Low        | Transaction-local `set_config`; CI test that runs two agencies concurrently on a pool of 1                               |
| A table ships without a policy                     | High     | Medium     | Migration guard test: every table with an `agencyId` column must have `ENABLE` + `FORCE ROW LEVEL SECURITY` and a policy |
| Web runtime connects as table owner (bypasses RLS) | Critical | Low        | Separate `easemuse_app` role (no `BYPASSRLS`, not owner); startup check refuses to boot if `current_user` owns tables    |
| Prisma interactive transaction overhead            | Medium   | Medium     | Spike in sprint 1 (risks.md action 3); measure p95 against NFR-P02                                                       |

## Implementation notes

- Policy template (raw SQL migration per table):
  ```sql
  ALTER TABLE "Candidate" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Candidate" FORCE ROW LEVEL SECURITY;
  CREATE POLICY agency_isolation ON "Candidate"
    USING ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid)
    WITH CHECK ("agencyId" = NULLIF(current_setting('app.agency_id', true), '')::uuid);
  ```
  If `app.agency_id` is unset, the predicate is NULL (false) and no rows are visible (fails closed). **`NULLIF(..., '')` is required** (spike T-F-07, [result](../spikes/tr-007-rls-pooling.md)): after a scoped transaction ends, the setting reads as an empty string, not NULL, on that pooled connection, and `''::uuid` would raise an error instead of returning no rows. The same applies to `app.user_id`.
- `src/lib/db/scoped.ts`: `withAgency(agencyId, (tx) => …)` opens an interactive transaction, sets the context, and passes the transaction client. Route wrappers (`authorizeAgency`) call it after resolving membership. **Unscoped access to the base Prisma client is banned** outside `lib/db` and migrations (ESLint `no-restricted-imports` + guard test).
- Application code still adds `agencyId` to every `where` (defense in depth, and index use).
- Jobs carry `agencyId` in the payload; the job runner calls `withAgency` before the handler.
- SSE channel names include the agency; the SSE route checks membership.
- Isolation test suite: for each API route, create agencies A and B, act as A on B's ids, and expect 404 and zero rows (product-manager's route classification guard, extended).
- **Platform tables not under RLS:** `Agency`, `User`, `JobRun` (ids and status only; `agencyId` null for system jobs). They are reached only through membership-checked services, the queue layer or the platform-admin role, and never hold candidate data.
- **Lookups before an agency is chosen** (validation finding):
  - `Membership` has a second policy, `USING ("userId" = current_setting('app.user_id', true)::uuid)`, so `GET /api/v1/me` can list the signed-in user's own memberships across agencies (the scoped client sets `app.user_id` from the session).
  - Magic-link redemption and member-invite acceptance carry `:agencySlug` in the route. The slug resolves to the agency id (Agency is not under RLS), the context is set, and only then is `tokenHash` looked up.
- **Tenant deletion** is an explicit per-table delete job, not a database cascade (see ADR-016). A guard test checks that the job covers every table with `agencyId`.

## Related decisions

- ADR-012 Access control model · ADR-008 Embeddings (raw SQL under RLS) · ADR-016 Audit and data rights

## Related requirements

FR-TEN-01, FR-TEN-07, FR-TEN-08, FR-PLT-02, NFR-S08, NFR-SC03; risks TR-001, TR-007

## References

- product-manager `docs/security/tenant-isolation-audit.md`, `apps/web/src/lib/db.ts`, `src/lib/auth/with-org-auth.ts`
- PostgreSQL docs: Row Security Policies; `set_config` / `current_setting`

## Decision record

| Date       | Author               | Action                                                                                      |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------- |
| 2026-10-06 | Claude (AI-assisted) | Created                                                                                     |
| 2026-10-06 | Product owner        | Accepted                                                                                    |
| 2026-10-07 | Claude (AI-assisted) | Policy template changed to the `NULLIF` form after spike T-F-07 (no change to the decision) |
