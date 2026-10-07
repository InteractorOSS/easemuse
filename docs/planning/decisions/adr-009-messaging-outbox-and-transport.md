# ADR-009: Messaging: outbox and pluggable transport

## Status
Accepted (2026-10-06, product owner)

## Date
2026-10-06

## Context
Recruiters must send outreach email from the app (decision Q-04), but no real mail service is connected yet. Brief §7.2 defines 3-touch sequences across LinkedIn, email, text and phone. The recruiter decides every send (§1.1, §7.2). product-manager sends via nodemailer over SMTP. Its transport returns null and skips sending when unconfigured, and sending happens in queued jobs, with opt-out links (`lib/email/optout-link.ts`).

## Options
1. **Send synchronously from the route handler.** No retries, no test mode, poor logging.
2. **Outbox table + queued delivery + transport interface.** Chosen.
3. **A third-party sequencing tool.** Conflicts with "no automatic sending" and adds a sub-processor.

## Decision
**Option 2.**
- `OutboxMessage` rows are created by (a) a recruiter clicking **Send** on one approved touch, or (b) system notifications (portal invites, reminders). There is no bulk outreach send.
- The `messaging.send` job delivers through `Transport.send(message): {status, providerId?}`. Implementations:
  - `dev-capture`: stores only, status `captured`. Default for non-production and for agencies without a provider. The UI says "Test mode: not delivered".
  - `log-only`: like dev-capture but writes to logs.
  - `smtp`: nodemailer, port of product-manager's `lib/email/transport.ts`.
  - later `gmail` / `graph`: per-recruiter OAuth through **Interactor credentials** (tokens held by Interactor; we store only `credential_id`); reply sync via Interactor webhooks (HMAC).
- The transport is chosen by agency setting plus environment. Features call `messaging.enqueue()` only and never know the transport.
- Suppression is checked at enqueue and again at send. Every outreach email gets a per-agency unsubscribe link (public route, signed token), and unsubscribing creates a `Suppression` and sets do-not-contact (FR-MSG-05, FR-SRC-09).
- Retries use exponential backoff (max 5); permanent failures mark the touch "failed" and create a task.
- LinkedIn, text and phone remain copy-and-mark-sent (C4 forbids LinkedIn automation). SMS can later use the same outbox (FR-MSG-06), with consent checks.

## Consequences
Uniform logging and test mode from day one; switching provider is configuration. One extra table and job per message.

## Related
FR-OUT-03/04/07, FR-MSG-01…06, US-504/505; risk ER-004.

## Decision record
| Date | Author | Action |
|------|--------|--------|
| 2026-10-06 | Claude (AI-assisted) | Created |
| 2026-10-06 | Product owner | Accepted |
