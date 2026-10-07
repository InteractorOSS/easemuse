# ADR-017: Mobile scope

## Status
Accepted (2026-10-06, product owner)

## Date
2026-10-06

## Context
The stack includes Expo 56 / React Native 0.86. The brief does not ask for a mobile app. Recruiters work at a desk (resume reading, report writing; brief §4–10). Hiring managers and candidates act from email, often on phones (portals, FR-HMP-07, FR-CDP-07). product-manager keeps shared domain types and query hooks in `packages/core` so a native app can reuse them.

## Decision
- **No native app in releases 1–3** (Q-09 default).
- Portals are **mobile-first responsive web** (360 px minimum, axe-checked).
- The recruiter workbench is desktop-first (≥ 1280 px) with responsive read views ("My tasks today", pipeline status) usable on phones.
- Keep `packages/core` free of `next/*` imports (product-manager rule) so a later Expo app (e.g., recruiter tasks and call notes on the go, brief §8) can reuse schemas and API clients.

## Consequences
Less scope; the mobile option stays open at low cost.

## Related
NFR-U02, Q-09, FR-HMP-07, FR-CDP-07.

## Decision record
| Date | Author | Action |
|------|--------|--------|
| 2026-10-06 | Claude (AI-assisted) | Created |
| 2026-10-06 | Product owner | Accepted |
