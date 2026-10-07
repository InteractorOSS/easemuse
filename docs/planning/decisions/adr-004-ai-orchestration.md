# ADR-004: AI orchestration: direct model calls through an in-app AI gateway

## Status
Accepted (2026-10-06, product owner)

## Date
2026-10-06

## Context
The brief (§1.1, §15②) says AI works only when the recruiter asks, everything AI produces is a draft, and the recruiter approves. The 18 AI capabilities (planning handoff §4, A1–A18) are mostly **single structured calls** (extract, structure, compare, draft), not open-ended agents.

The Interactor platform offers agents (assistants, rooms, tools, approval gates) and workflows (state machines with AI and HTTP steps). product-manager uses both, and also has an in-app provider layer (`src/lib/ai/providers`, `callStructured` with zod, `*_PROMPT_VERSION`, `LlmCall` cost ledger, per-org budget).

## Decision drivers
- Full control of the draft → approve lifecycle and provenance (FR-AI-01…04)
- Deterministic, testable behaviour per capability (eval set, NFR-AI01–05)
- Lowest latency for streaming drafts
- Reuse of product-manager code where possible

## Considered options
1. **Direct model calls through an in-app AI gateway** (product-manager `lib/ai` pattern, extended). Single calls with structured output; the app owns prompts, versions, provenance and approval.
2. **Interactor agents for each capability.** Built-in tool approval gates, but agent rooms are built for multi-turn tool use, which most capabilities don't need. Harder to make "draft only, nothing executes" explicit, and adds a network hop.
3. **Interactor workflows for multi-step capabilities** (e.g., benchmark = search → extract → suggest). Visual and declarative, but splits logic across two systems.

## Decision
**Option 1 for all release 1–3 capabilities.** One gateway (`server/ai`) is the only module allowed to import the Anthropic SDK (lint rule). Interactor agents and workflows are **not used** at first. Revisit for a conversational assistant over a client's history (FR-KNW-03), which may suit an agent with read-only tools.

## Consequences
**Positive**: each capability is one function with one prompt module, one zod schema and one eval; provenance is complete; easy to test.
**Negative**: no reuse of Interactor agent tooling. Multi-step flows (benchmark) are coded as sequential calls in a job.
**Neutral**: if agents are adopted later, they sit behind the same gateway, so provenance and budget checks still apply.

## Implementation notes
- `ai.run(purpose, input, ctx)` steps: check requester or the embedding exception (FR-AI-01) → budget (ADR-013) → prompt build → model call (ADR-005) → `LlmCall` + `AiGeneration` → post-process (fact check, score calculator) → `ArtifactVersion(draft)` (ADR-006).
- Prompt modules: `server/ai/prompts/<purpose>.ts` export `PROMPT_VERSION`, `schema` (from `packages/core`), `buildMessages(input)`.
- **Structured output: use the API's structured outputs** (`output_config.format` / the SDK's `messages.parse()` with zod). Do **not** copy product-manager's forced `tool_choice` approach: Claude Opus 5.5 (ADR-005) rejects forced `tool_choice: any|tool` with a 400.
- Always check `stop_reason` before reading content (`refusal`, `max_tokens`). Map refusals to a user-facing "couldn't draft this" with no partial save.
- Streaming for long drafts (A1, A12, A15, A16), using the SDK's final-message helper on completion.

## Related
ADR-005, ADR-006, ADR-007, ADR-013. Requirements FR-AI-01…09; brief §1.1, §15.

## Decision record
| Date | Author | Action |
|------|--------|--------|
| 2026-10-06 | Claude (AI-assisted) | Created |
| 2026-10-06 | Product owner | Accepted |
