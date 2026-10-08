# ADR-013: SaaS billing, AI usage metering and budgets

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

Agencies are billed for seats and AI usage (FR-TEN-05). One agency must not exhaust shared capacity (NFR-SC03). AI cost must be visible per request (FR-AI-08). product-manager meters usage **after the fact** to Interactor Billing Server (`POST /api/service/usage`). Its README says "There is NO pre-flight quota check", and AI spend is capped **locally** (`checkMonthlyBudget` over the `LlmCall` ledger).

## Decision

- **Ledger:** every model call writes `LlmCall` (tokens, cached tokens, cost from a price table keyed by model, plus web search fees). Embedding calls are logged too.
- **Local budget gate:** `ai.run` checks the agency's month-to-date cost against `Agency.aiMonthlyBudgetUsd` (from plan) **before** the call. Over budget → `402 budget_exceeded`; the UI says AI drafting is paused and non-AI work continues (US-1304). Admins get warnings at 80% and 100%.
- **Throughput fairness:** the BullMQ `ai` queue uses a per-agency rate limiter (group key = agencyId), so batch analyses from one agency can't starve others.
- **Billing Server (release 2):** an hourly job aggregates `LlmCall` + active seats per agency and posts usage to Billing Server; plan and subscription state is read from Billing Server and cached on `Agency.plan`. No Stripe (stack decision).
- **Release 1:** ledger + local budget only (Team of Wakers' internal use is tenant #1, no invoicing).

## Consequences

Cost control works before billing exists; the price table must be maintained when models or prices change (ADR-005).

## Related

ADR-004, ADR-005. FR-AI-08, FR-TEN-05, NFR-SC03, US-1304/1308; Q-14 (superseded), Q-27; risk TR-003.

## Decision record

| Date       | Author               | Action   |
| ---------- | -------------------- | -------- |
| 2026-10-06 | Claude (AI-assisted) | Created  |
| 2026-10-06 | Product owner        | Accepted |
