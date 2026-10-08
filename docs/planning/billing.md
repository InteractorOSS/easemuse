# Billing through the Interactor Billing Server (T-13-08)

Status 2026-10-07: **built against an interface, with a recording fake. Not yet run against the real server**, because no credentials existed. This page says how it works, how to switch it on and what to give us.

## What it does

| Where                                                 | What                                                                                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform admin (`/admin` → agency → Plan and billing) | See the agency's plan, seats, this month's AI use and invoices. Put an agency on a plan (owner or admin). Read the plan from Billing again.                                                           |
| Agency admin (Settings → Plan and seats)              | See the same for their own agency.                                                                                                                                                                    |
| Inviting a person, or switching a member back on      | Refused with `seat_limit_reached` (402) when active members plus open invitations already reach the plan's seat limit. Uses the last synced limit, so a Billing Server outage never blocks an agency. |
| Daily job `maintenance:billing.report` (04:00 UTC)    | For every active agency that has a subscription: report AI cost and seats, then read the plan back. Does nothing while billing is not connected.                                                      |

Billing Server has **no pre-flight quota check** (its README says so). AI spend is still gated locally by the agency's monthly budget (ADR-013); the plan does not change that budget automatically.

## Modes (`BILLING_MODE`)

| Mode            | Meaning                                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `off` (default) | Billing is not connected. Screens say so; nothing is reported; seats are not limited.                                                                                                                                                                  |
| `fake`          | An in-memory stand-in with two sample plans (Starter: 3 seats, Team: 10 seats), to try the screens. One process only: the web app and the worker do not share it, so the daily job will not see subscriptions made through the web app.                |
| `live`          | The real server. Needs `INTERACTOR_AUTH_CLIENT_ID` and `INTERACTOR_AUTH_CLIENT_SECRET` (the app's Account Server client, used for `client_credentials` service tokens) and optionally `BILLING_SERVER_URL` (default `https://billing.interactor.com`). |

## What EaseMuse reports (the metrics)

| Metric          | Unit           | When                                                                                                                                                        | Idempotency key                                       |
| --------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `ai_cost_cents` | whole US cents | The growth in this month's AI cost (from the `LlmCall` ledger) since the last report; the sub-cent remainder carries over, so a month adds up to the ledger | `ai_cost_cents:<agency>:<YYYY-MM>:<cumulative cents>` |
| `seats`         | active members | Once a day, a snapshot                                                                                                                                      | `seats:<agency>:<YYYY-MM-DD>`                         |

Every report is written to `BillingUsageReport` first, then sent; a failure is kept (`failed`, with a short code) and sent again the next run with the **same key**, up to 10 attempts, so Billing Server counts it once.

The agency is a Billing Server **subscriber** of type `organization` whose id is the agency id (`AGENCY_SUBSCRIBER_TYPE` in `server/billing/metrics.ts`).

## What I need from you

1. **Credentials**: the app's Account Server client id and secret with permission to call the Billing Server service API (`/api/service/...`) for subscribers of type `organization`, and the Billing Server URL if it is not the default. Set them in the environment (never in git) and switch `BILLING_MODE=live`.
2. **A plan catalogue in Billing Server** (Team of Wakers' commercial decision), with these metrics on each plan:
   - `seats` as a **hard limit** (the seat limit EaseMuse enforces) and the price per seat or the included seats;
   - `ai_cost_cents` as usage (priced per cent, or an included amount with overage).
     Plan names are shown as Billing Server sends them. A stable `role` key per plan (for example `easemuse_team`) is shown as the agency's plan label.
3. **Confirmation of four assumptions** (all in `server/billing/`, each easy to change):
   - the subscriber type is `organization` and the id is the agency id;
   - `seats` accepts a daily snapshot (the plan decides how a month is billed, for example by the highest day) rather than an increment;
   - a second subscription for an agency on another plan is refused (we create subscriptions only; moving an agency to another plan is done in Billing Server, and the screen says so);
   - `GET /api/service/charges` lists the invoices of a subscriber, newest first.
4. A **test subscriber or a staging Billing Server** to run the first end-to-end check (assign a plan, run the job, see the usage and the invoice).

## Checks once credentials exist

1. `BILLING_MODE=live`, restart web and worker.
2. In `/admin`, open a test agency, choose a plan, "Put on this plan": the plan and seat limit appear; Billing Server shows the subscription.
3. Invite people until the seat limit: the next invitation is refused.
4. Use the AI once, then run the daily job (enqueue `billing.report` on the maintenance queue): `BillingUsageReport` rows go to `sent`, Billing Server shows `ai_cost_cents` and `seats`.
5. Stop Billing Server (or break the URL): reports become `failed`, the plan stays, invitations still work; start it again and the next run sends them once.
