# ADR-014: Use of Interactor platform services

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

The stack lists Interactor services: Account Server, credentials, SKB, agents, workflows, webhooks, Billing Server, UKB and userdb. Definitions come from product-manager `apps/web/src/lib/interactor/README.md`:

- **SKB:** "Interactor's catalog of every external integration the platform knows how to talk to … and the capabilities each one exposes."
- **UKB:** "lets you point natural-language questions at a registered SQL data source and get back results + the SQL + an explanation."
- **userdb:** "Interactor's shared file storage + dynamic-entity backend."

All take JWT bearer tokens scoped by the token's `org` claim.

## Decision

| Service         | Use in easemuse                                                                                                                                                            | When                          | ADR |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --- |
| Account Server  | Agency user and platform administrator sign-in (OIDC); worker service tokens                                                                                               | Release 1                     | 002 |
| userdb          | **Not used** (product owner, Q-34): documents stay in EaseMuse's own database                                                                                              | —                             | 010 |
| Billing Server  | Plans, seats, usage metering                                                                                                                                               | Release 2                     | 013 |
| credentials     | OAuth to agency mailboxes (Gmail / Microsoft 365) for sending and reply sync                                                                                               | Release 2 (US-505)            | 009 |
| webhooks (HMAC) | Inbound provider events (mail replies)                                                                                                                                     | Release 2                     | 009 |
| SKB             | Discover the mailbox and calendar integrations available for credentials                                                                                                   | Release 2–3, with credentials | 009 |
| agents          | **Not used** (ADR-004); reconsider for a conversational assistant over client history (FR-KNW-03)                                                                          | Later                         | 004 |
| workflows       | **Not used**; multi-step AI flows are app jobs                                                                                                                             | —                             | 004 |
| UKB             | **Not in release 1–2.** Candidate for System 12 natural-language questions over the agency's own data (brief §14), only if RLS-equivalent per-agency scoping is guaranteed | Evaluate in release 3         | —   |

- Client modules are copied from product-manager `src/lib/interactor/*` (auth, billing, credentials, webhooks HMAC), with the same `service-urls.ts` pattern.
- Per-agency scoping in Interactor calls: pass the agency id and the external user id (credentials) in the request, as product-manager does. **Inferred, to verify:** product-manager's worker service token carries the app's own org claim rather than each customer's.

## Consequences

Fewer services to build; dependence on Interactor availability for sign-in and billing. Non-AI work can't continue during an Account Server outage (accepted; same as product-manager).

## Related

ADR-002, 004, 009, 010, 013. Q-19 (resolved by this ADR once accepted).

## Decision record

| Date       | Author               | Action   |
| ---------- | -------------------- | -------- |
| 2026-10-06 | Claude (AI-assisted) | Created  |
| 2026-10-06 | Product owner        | Accepted |
