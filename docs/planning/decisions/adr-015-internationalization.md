# ADR-015: Internationalization

## Status

Accepted (2026-10-06, product owner)

## Date

2026-10-06

## Context

U.S. first, Korea possible later (Q-07). NFR-U04: English UI first, Korean-ready. AI outputs follow the language the recruiter selects. The brief is written in Korean with English recruiting terms, so recruiters may be bilingual. product-manager uses next-intl with `messages/{en,ja,ko}/*.json` and an ESLint rule that blocks literal strings in JSX.

## Decision

- next-intl from day one with `messages/en/*.json` complete and a `messages/ko/` skeleton. The ESLint literal-string rule is enabled (reuse product-manager config).
- Locale per user (profile setting), default from the agency setting. Portal locale defaults to the agency setting and can be overridden per invite.
- **AI output language** is a per-request parameter (default: agency's document language, initially English). Prompts are written in English and instruct the output language. Resumes and JDs keep their source language unless the recruiter asks for translation (not in scope).
- Dates, currency and number formats via `Intl`. `Position.compCurrency` defaults to USD.
- Email templates are localized like product-manager (`messages/*/email.json`).

## Consequences

Small upfront cost; Korean launch becomes translation work plus a region deployment (ADR-001), not refactoring.

## Related

NFR-U04, C2, FR-TEN-08, Q-08.

## Decision record

| Date       | Author               | Action   |
| ---------- | -------------------- | -------- |
| 2026-10-06 | Claude (AI-assisted) | Created  |
| 2026-10-06 | Product owner        | Accepted |
