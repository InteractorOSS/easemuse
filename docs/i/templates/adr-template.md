# ADR-[NUMBER]: [Title]

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Date

[YYYY-MM-DD]

## Context

[Describe the context and problem that led to this decision. What is the issue we're facing? What forces are at play (technical, political, social)?]

## Decision Drivers

- [Driver 1: e.g., Need to support high concurrency]
- [Driver 2: e.g., Team expertise in technology X]
- [Driver 3: e.g., Budget constraints]
- [Driver 4: e.g., Timeline requirements]

## Considered Options

### Option 1: [Name]

**Description**: [Brief description of this option]

**Pros**:
- [Pro 1]
- [Pro 2]
- [Pro 3]

**Cons**:
- [Con 1]
- [Con 2]

**Estimated Effort**: [Low / Medium / High]

---

### Option 2: [Name]

**Description**: [Brief description of this option]

**Pros**:
- [Pro 1]
- [Pro 2]

**Cons**:
- [Con 1]
- [Con 2]

**Estimated Effort**: [Low / Medium / High]

---

### Option 3: [Name]

**Description**: [Brief description of this option]

**Pros**:
- [Pro 1]
- [Pro 2]

**Cons**:
- [Con 1]
- [Con 2]

**Estimated Effort**: [Low / Medium / High]

---

## Decision

We have decided to go with **[Option X]**.

### Rationale

[Explain why this option was chosen over the others. Be specific about how it addresses the decision drivers and context.]

## Consequences

### Positive

- [Positive consequence 1]
- [Positive consequence 2]
- [Positive consequence 3]

### Negative

- [Negative consequence 1 and how we'll mitigate it]
- [Negative consequence 2 and how we'll mitigate it]

### Neutral

- [Neutral observation 1]
- [Neutral observation 2]

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [Risk 1] | [H/M/L] | [H/M/L] | [Mitigation strategy] |
| [Risk 2] | [H/M/L] | [H/M/L] | [Mitigation strategy] |

## Implementation Notes

[Any specific implementation guidance or considerations]

- [Note 1]
- [Note 2]

## Related Decisions

- [ADR-XXX: Related Decision Title](./adr-xxx.md)
- [ADR-YYY: Another Related Decision](./adr-yyy.md)

## Related Requirements

- [Requirement or User Story ID]
- [Another related requirement]

## References

- [Link to relevant documentation]
- [Link to relevant research or articles]
- [Link to relevant code or PRs]

---

## Decision Record

| Date | Author | Action |
|------|--------|--------|
| [YYYY-MM-DD] | [Name] | Created |
| [YYYY-MM-DD] | [Name] | Updated: [Brief description of change] |
| [YYYY-MM-DD] | [Name] | Accepted by [approvers] |

---

## Notes

[Any additional notes, discussion points, or historical context that might be useful for future reference]

---

# ADR Template Usage Guide

## When to Write an ADR

Write an ADR when making decisions that:
- Affect the architecture significantly
- Are difficult to reverse
- Have long-term implications
- Need to be communicated to the team
- Might be questioned later

## Examples of ADR Topics

- Choosing a database (PostgreSQL vs MySQL vs MongoDB)
- Selecting a framework (React vs Vue vs Angular)
- Designing API style (REST vs GraphQL vs gRPC)
- Authentication strategy (JWT vs Sessions)
- Deployment approach (Kubernetes vs Serverless)
- Caching strategy (Redis vs Memcached)
- Message queue selection (RabbitMQ vs Kafka)
- Monolith vs Microservices architecture
- State management approach
- Testing strategy

## Tips for Writing Good ADRs

1. **Be concise** - Decision records should be quick to read
2. **Be specific** - Include concrete details and examples
3. **Document the "why"** - Future readers need context
4. **List alternatives** - Show you considered other options
5. **Acknowledge trade-offs** - No decision is perfect
6. **Keep it updated** - Mark deprecated ADRs as superseded
7. **Link related decisions** - Help readers follow the thread

## File Naming Convention

Use this naming pattern for ADR files:
```
docs/planning/decisions/adr-001-database-selection.md
docs/planning/decisions/adr-002-api-framework.md
docs/planning/decisions/adr-003-authentication-strategy.md
```
