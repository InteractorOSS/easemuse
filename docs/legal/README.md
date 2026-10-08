# Legal and security documents (T-SEC-01)

**Status: drafts written 2026-10-07, not reviewed by counsel.** They are the starting point for the documents the first external agency signs (risk R13, requirement NFR-S10). Square brackets mark a choice the product owner or counsel has to make; nothing in brackets has been decided. Statements about what the product does are checked against the code and ADRs on the date above; where a statement depends on something not built yet, it says so.

| Document                                                       | What it is                                                  | Who has to act                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| [terms-of-service.md](./terms-of-service.md)                   | SaaS terms between Team of Wakers and an agency             | Product owner: commercial terms. Counsel: everything |
| [data-processing-agreement.md](./data-processing-agreement.md) | DPA with the security measures and the AI provisions        | Counsel; product owner for the bracketed periods     |
| [sub-processors.md](./sub-processors.md)                       | Who else touches customer data, what, where, and since when | Product owner: hosting, mail, monitoring entries     |
| [pen-test-brief.md](./pen-test-brief.md)                       | What to hand the penetration tester, and what to ask for    | Product owner arranges the test                      |

## Decisions the documents need (collected from the brackets)

1. **Hosting**: provider, region and the entity that runs the database and object storage (infrastructure was out of scope for the planning documents). The sub-processor list has an empty row for it.
2. **Outbound email**: SMTP transport and the real mail provider with reply sync are postponed (T-5-02, T-5-12). Until they exist, "email sent" means captured in the outbox. The list names the provider as _planned_.
3. **Commercial terms**: fees and the plan catalogue (the Interactor Billing Server holds them), payment terms, term and renewal, liability cap, governing law, notice addresses.
4. **Time limits**: breach notice period, how long after contract end the data stays before deletion, backup retention after deletion, the period to object to a new sub-processor.
5. **Anthropic terms**: the DPA and the zero-retention / no-training setting (NFR-S05) have to be confirmed in writing with Anthropic. The documents say the product is _designed to_ require them.
6. **Privacy notices**: the agency is the controller and publishes its own notice to candidates and hiring managers; Team of Wakers should supply a template. Not written yet.
7. **AI-in-hiring duties**: the documents put the deployer's duties (notices, audits, appeals) on the agency and offer documentation from Team of Wakers. Counsel confirms which laws apply to the first customers (Q-07: mainly the U.S., Korea later).

## Where the facts come from

Requirements NFR-S01 to S10, FR-AI-09; ADR-001 (isolation), ADR-002/003 (identity, portals), ADR-005 (models), ADR-008 (embeddings), ADR-010 (documents stay in our own database), ADR-012 (access control and support access), ADR-013/014 (billing, Interactor services), ADR-016 (audit, data rights, tenant export and deletion), and `docs/planning/implementation-notes.md`.
