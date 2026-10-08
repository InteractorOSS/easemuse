# ADR-002: Identity for agency users, platform administrators and portal users

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

Five kinds of people sign in (FR-PLT-01):

- agency admins, leads and recruiters (daily, heavy users)
- Team of Wakers platform administrators
- hiring managers (occasional, external)
- candidates (occasional, external)

The stack mandates Interactor Account Server (Auth.js v5 with Interactor login). The Q-23 default recorded in discovery was "recruiter-issued magic-link invites, backed by Account Server".

product-manager signs agency-type users in via Account Server OIDC (`interactorOidcProvider`). It already runs an **app-local magic-link provider** for people who should not need an account (`techSetupInviteProvider`, single-use token) and shared-link access for external viewers.

## Decision drivers

- Hiring managers and candidates must act in a few clicks from an email, with no account creation or password (FR-HMP-07, FR-CDP-07)
- Candidate identity is separate per agency (Q-26)
- Agency users get SSO, MFA and Interactor org integration
- Risk TR-008: Account Server may not model invite-only external users per agency

## Considered options

### Option 1: Account Server accounts for everyone

**Pros**: one identity system.
**Cons**: account creation is friction for one-off HM and candidate actions; ties candidate identity to a global Interactor identity, which conflicts with per-agency separation; depends on Account Server supporting per-agency guest users (unconfirmed).

### Option 2: Account Server for agency users and platform administrators; app-local magic links for portal users

**Pros**: proven in product-manager; zero friction for external users; per-agency identity by construction (`PortalUser` unique on agency + audience + email); no dependency on Account Server guest support.
**Cons**: two session types to secure; the app owns magic-link security.

### Option 3: Shared links without identity (link = access)

**Pros**: simplest.
**Cons**: forwarded links grant access; no reliable audit of who approved; weak for consent (legal record).

## Decision

**Option 2.** Agency users and platform administrators sign in through Interactor Account Server (OIDC via Auth.js v5, as in product-manager). Hiring managers and candidates sign in with **app-issued magic links**: single-use, hashed at rest, expiring after 7 days for invites and 15 minutes for re-login. Each issues a **portal session** distinct from the agency session.

### Product owner direction (Q-32, 2026-10-06)

Use Interactor auth the way product-manager does. Agency users and platform administrators sign in with Interactor login (OIDC) through Auth.js v5. The **app client id and secret are provided by the product owner** and live only in environment variables (`INTERACTOR_AUTH_CLIENT_ID`, `INTERACTOR_AUTH_CLIENT_SECRET`), set locally in `.env.local` (git-ignored) and never in the repository. Portal users use an Auth.js magic-link provider, as product-manager's `techSetupInviteProvider` does.

### Deviation from the discovery default

Q-23's default said magic links "backed by Account Server". This ADR proposes that portal users **do not get Account Server accounts**. The magic link is app-local, as in product-manager's `techSetupInviteProvider`. This removes risk TR-008 and keeps candidate identity per agency. If the product owner wants portal users in Account Server (for example, for a future cross-agency candidate profile), Option 1 can be added later because `PortalUser` can link to an Interactor subject.

## Consequences

**Positive**: external users act in one click; identity per agency; no dependency on unconfirmed Account Server features.
**Negative**: the app must harden magic links. Mitigation: hashed tokens, single use, short re-login TTL, rate limits per email and IP, a device-bound session cookie, and re-issue on expiry.
**Neutral**: portal sessions use a separate cookie name and audience. `resolveActor` returns `AgencyActor | PortalActor | PlatformAdminActor`.

## Risks

| Risk                                       | Impact | Likelihood | Mitigation                                                                                                   |
| ------------------------------------------ | ------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| Forwarded email gives a third party access | Medium | Medium     | Single-use link; re-login link sent only to the registered email; the portal shows "not you?"; access logged |
| Session confusion between audiences        | High   | Low        | Different cookies, route groups and API prefixes; guard tests per audience                                   |

## Implementation notes

- Agency users: reuse product-manager `auth.ts`, `auth-providers.ts` and `auth-callbacks.ts` patterns. `jwt` upserts `User` by Interactor `sub`; membership is checked per request (`authorizeAgency`), not stored in the session.
- Service tokens for the worker: reuse `service-token.ts` (client_credentials).
- Portal: `MagicLink(tokenHash, expiresAt, usedAt)` → `POST /api/portal/v1/:agencySlug/magic-link/redeem` (slug sets the agency context before the token lookup, ADR-001) → signed portal session cookie (`em_portal`) carrying `portalUserId` and `agencyId`.
- Release 1 needs only the agency-user path. Portal auth ships in release 2 with E14/E15.

## Related

ADR-003 (portal architecture), ADR-012 (access control). Requirements: FR-PLT-01, FR-HMP-01, FR-CDP-01, NFR-S01, NFR-S09; Q-23, Q-26; risk TR-008.

## Decision record

| Date       | Author               | Action   |
| ---------- | -------------------- | -------- |
| 2026-10-06 | Claude (AI-assisted) | Created  |
| 2026-10-06 | Product owner        | Accepted |
