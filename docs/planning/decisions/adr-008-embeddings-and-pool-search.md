# ADR-008: Embeddings and talent-pool search

## Status
Accepted (2026-10-06, product owner)

## Date
2026-10-06

## Context
Talent pool search (FR-SRC-08, < 2 s p95 at 50k candidates per agency), similar candidates from the pool (FR-SRC-06, brief §4.3) and candidate portfolio (FR-SRC-07) need text search plus semantic similarity. Brief §14 (experience reuse) also benefits. Anthropic's API does not provide an embedding model. product-manager uses **Voyage AI `voyage-3-large` (1024 dims)** for general text, with pgvector HNSW indexes and raw SQL (`<=>`). Its README reports cost at about $0.18 per 1M tokens.

## Options
1. **Postgres full-text only.** Cheap and simple, but misses synonyms ("HRBP" vs "HR Business Partner").
2. **Full-text + pgvector embeddings (Voyage `voyage-3-large`, 1024 dims), filtered by agency.** Chosen.
3. **External search engine** (OpenSearch etc.). More infrastructure, plus a second place to enforce tenant isolation.

## Decision
**Option 2.**
- Keyword search uses `tsvector` over the approved profile text (`Candidate.searchText`, GIN index). Semantic search uses `ProfileEmbedding(vector(1024))` with an HNSW index.
- Hybrid ranking: full-text rank and cosine similarity combined; structured filters (skills, location, seniority, tags, last contact) applied in SQL.
- **Embedding is indexing, not an AI decision.** It runs automatically after a profile or success profile is **approved**. This is the single documented exception to "AI only on request" (FR-AI-01, planning handoff X2).
- All raw SQL runs inside `withAgency` (ADR-001), so RLS applies. Queries also filter `"agencyId"` explicitly so the HNSW index plus filter plans well. Use iterative index scan settings (pgvector ≥ 0.8) if filtered recall drops.
- Single embedding provider (Voyage). No silent fallback to another provider, because candidate data must only reach listed sub-processors. If Voyage is down, the embedding job retries, and search degrades to full-text.
- `model` and the version are stored per row, so a later re-embed can run as a background job.

## Consequences
Voyage becomes a **sub-processor of candidate data**: add it to the DPA sub-processor list (NFR-S10) and confirm its retention terms. Cost is negligible versus LLM calls.

## Related
ADR-001, ADR-005. FR-SRC-06…08, FR-KNW-01, NFR-P03.

## Decision record
| Date | Author | Action |
|------|--------|--------|
| 2026-10-06 | Claude (AI-assisted) | Created |
| 2026-10-06 | Product owner | Accepted |
