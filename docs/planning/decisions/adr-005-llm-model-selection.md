# ADR-005: LLM provider, model selection and web search

## Status
Accepted (2026-10-06, product owner)

## Date
2026-10-06

## Context
Every AI capability (A1–A18) needs a model. Quality matters most where errors reach clients or candidates: match analysis (brief §5), tailored resume (§9.1, no invented facts) and submission report (§10). Volume is highest for profile structuring (§4.2, ~30–50 per position). Benchmarking (§3.3) needs web search with sources (Q-05/Q-21: AI web search, no paid data). The stack already uses `@anthropic-ai/sdk` (product-manager).

Current Anthropic models (first-party API pricing, cached reference dated 2026-09-25; **verify at implementation**):

| Model | ID | Input / output per 1M tokens | Notes |
|-------|----|------------------------------|-------|
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 | Default model. Thinking can't be disabled; effort defaults to `medium`, so set it explicitly per route. Forced `tool_choice` returns 400 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 | Effort default `high` |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1 / $5 | 200K context |

## Decision drivers
- Accuracy on the eval set (extraction ≥ 95%, zero invented facts)
- Cost per position within plan pricing (TR-003)
- Latency for streamed drafts (NFR-P04)
- Data terms: no training on inputs; zero data retention where available (NFR-S05). **Note:** Claude Fable 5.1 requires 30-day retention unless Anthropic authorizes otherwise, so it is excluded.

## Considered options
1. **Claude Opus 5.5 for every purpose, with effort tuned per route.** One model, one cache namespace, simplest operations. Anthropic's guidance: measure the most capable model at lower effort before building a multi-model cascade.
2. **Mixed routing** (e.g., Haiku 4.5 or Sonnet 5.5 for high-volume extraction A7, A14, A17; Opus 5.5 for A10, A15, A16). Lower cost on volume purposes, at the cost of extra models to evaluate and separate caches.
3. **Multi-provider** (product-manager has OpenAI and Gemini adapters with fallback). More resilience, but more evals, data agreements and behaviour drift.

## Decision
**Option 2, mixed routing (product owner decision Q-33, 2026-10-06):**
- **`claude-sonnet-5-5`** for high-volume extraction and structuring: A2 intake questions, A6 search criteria, A7 profile structuring, A13 call questions, A14 notes → qualification, A17 feedback structuring, and the X1 fact-check verifier. Effort `low` or `medium`.
- **`claude-opus-5-5`** for outputs that reach clients or candidates or drive decisions: A1 JD structuring, A3 benchmark, A5 success profile, A10 match analysis, A12 outreach, A15 tailored resume, A16 submission report, A18 pattern summary. Effort set explicitly: `medium` for A1, A5, A12, A18; `high` for A3, A10, A15, A16.

The eval (T-QA-03/04) still runs before launch. If Sonnet misses the accuracy targets on a purpose (extraction ≥ 95%, zero invented facts), that purpose moves to Opus. The table is configuration, so changes don't touch feature code.

A **routing table** (`server/ai/routing.ts`: purpose → model, effort, max_tokens) makes any change a configuration change. Option 3 is rejected for now; product-manager's provider abstraction is kept so it remains possible.

**Web search (A3, benchmarking):** the Claude API server tool `web_search_20260209` (supported on Opus 5.5), with `max_uses` capped (e.g., 5) and an optional `user_location`. Search results come back with citations. Because citations can't be combined with `output_config.format`, A3 runs in **two calls**: (1) search and write a cited summary; (2) structure that summary into `BenchmarkReport` with source URLs carried through. Agency-own-data items come from SQL and are labelled separately (Q-21). Web search has its own per-search fee: check current pricing and count it in `LlmCall`.

## Consequences
**Positive**: best quality from day one on the riskiest outputs; one model to evaluate; routing is a config change.
**Negative**: two models means two prompt-cache namespaces and two sets of eval baselines. Mitigation: per-purpose eval cases; per-agency budget caps (ADR-013); prompt caching.
**Neutral**: refusal fallbacks. On Opus 5.5, enable server-side fallback (`fallbacks: "default"` with beta `server-side-fallback-2026-07-01`) and always handle `stop_reason: "refusal"`.

## Implementation notes
- Thinking on Opus 5.5 is adaptive and can't be disabled; control cost with `output_config.effort` (Opus 5.5 defaults to `medium`, so set it explicitly). Sonnet 5.5 defaults to effort `high`; set `low`/`medium` for the extraction purposes. Neither model accepts forced `tool_choice`.
- Refusal fallback: `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) on both models; Sonnet 5.5 accepts only the `"default"` form.
- Structured outputs via `output_config.format` / `messages.parse()` (ADR-004). No assistant prefill.
- Prompt caching: keep system prompts and the success profile as a stable prefix so batch match analysis over N candidates reuses the cache. Verify `cache_read_input_tokens` > 0 in tests.
- Batch API (50% cost) is an option for non-urgent re-indexing or bulk re-analysis, not for interactive drafts.
- Embeddings are a separate decision (ADR-008).
- Re-run the eval before any model or prompt change (NFR-AI05).

## Related
ADR-004, ADR-008, ADR-013. Requirements FR-INT-07, FR-AI-08, NFR-P04, NFR-S05, NFR-AI01–05; risks TR-003, TR-009.

## References
Anthropic API reference (models, structured outputs, server tools `web_search_20260209`, prompt caching, refusal fallbacks), via the claude-api skill, cached 2026-09-25.

## Decision record
| Date | Author | Action |
|------|--------|--------|
| 2026-10-06 | Claude (AI-assisted) | Created |
| 2026-10-06 | Product owner | Accepted |
