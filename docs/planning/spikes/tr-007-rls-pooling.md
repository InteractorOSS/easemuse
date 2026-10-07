# Spike T-F-07: RLS + Prisma interactive transactions + pooled connections (TR-007)

| Field | Value |
|-------|-------|
| **Date** | 2026-10-06 |
| **Result** | **Go.** ADR-001 holds. Two adjustments to the policy template (below) |
| **Script** | `apps/web/scripts/spikes/rls-pool.ts` (re-runnable; touches only throwaway `rls_spike_*` tables in a `*_test` database) |
| **Environment** | Local PostgreSQL 14.18 (the target is 16; RLS behaviour used here is the same), Prisma 7.8 + `@prisma/adapter-pg`, role `easemuse_app` (not owner, no BYPASSRLS), FORCE ROW LEVEL SECURITY |

## Question
Can tenant context (`app.agency_id`) leak between requests that share a pooled connection, and what does per-request `BEGIN; set_config(..., true); ...; COMMIT` cost against NFR-P02 (non-AI API < 300 ms p95)?

## Method
1. **Correctness under contention:** pool size 1, 400 concurrent interactive transactions alternating between agencies A and B. Each sets `set_config('app.agency_id', $1, true)`, then reads an RLS table holding 1,000 rows per agency. A result is wrong if it has the wrong row count or any foreign row.
2. **Fails closed:** query with no context on the same pool (the connection has served scoped transactions before).
3. **Empty-string behaviour:** after a scoped transaction, read a table whose policy is the ADR's literal `current_setting('app.agency_id', true)::uuid`.
4. **Overhead:** 500 sequential runs each, pool size 10, of (a) a plain query, (b) an interactive transaction with the same query, (c) an interactive transaction with `set_config` plus the RLS query.

## Results
| Check | Result |
|-------|--------|
| 400 concurrent scoped transactions on a pool of 1, two agencies | **0 wrong results** |
| Query without context on a previously used connection | **0 rows** (fails closed) |
| ADR policy `current_setting(...)::uuid` after a scoped transaction on that connection | **Raises** `invalid input syntax for type uuid: ""` |

| Latency (localhost, so no network time) | p50 | p95 |
|---|---|---|
| Plain query | 0.13 ms | 0.19 ms |
| Interactive transaction only | 0.28 ms | 0.37 ms |
| Scoped transaction + `set_config` + RLS query | 0.38 ms | 0.49 ms |
| **Added p95 vs plain** | | **0.30 ms** |

The overhead is the extra round trips (`BEGIN`, `set_config`, `COMMIT`). On a real network each costs one RTT, so expect roughly 3 × RTT (a few ms in the same region). That is about 1% of the 300 ms budget. Re-measure against the deployed database when infrastructure exists.

## Findings
1. **Transaction-local `set_config(..., true)` does not leak** across pooled connections, even with a pool of one.
2. **Adjustment 1: use `NULLIF`.** After a scoped transaction ends, the setting reads as an empty string on that connection, not NULL, so the ADR's `current_setting('app.agency_id', true)::uuid` throws instead of returning no rows. It still fails closed, but noisily (500s instead of empty lists). Policies use `NULLIF(current_setting('app.agency_id', true), '')::uuid`, which yields NULL, a false predicate and zero rows. The same applies to `app.user_id`.
3. **Adjustment 2: keep the transaction short.** Each scoped unit of work is one interactive transaction with `maxWait`/`timeout` bounds (`TRANSACTION_OPTIONS`). A pool of 1 serialises work, so the web pool must be sized for concurrency, not for isolation.

## Follow-ups
- T-F-08 policies use the `NULLIF` form.
- T-F-09 turns the spike's transaction shape into `withAgency()` and keeps the pool-of-1, two-agency test as a permanent CI test.
