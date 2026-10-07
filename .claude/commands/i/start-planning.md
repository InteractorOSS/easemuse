# Start Planning Phase

Initialize the Planning phase for architecture design and task breakdown.

## Instructions

When this command is invoked, perform the following:

### 1. Verify Discovery Completion

Check if discovery artifacts exist:
- `docs/discovery/requirements.md`
- `docs/discovery/stakeholders.md`

If missing, warn that discovery phase may be incomplete.

### 2. Set Context

Update the project phase in CLAUDE.md to "planning".

### 3. Create Planning Workspace

Check if the following exist, create if missing:
- `docs/planning/` directory
- `docs/planning/architecture.md` (from template)
- `docs/planning/tasks.md`
- `docs/planning/risks.md`
- `docs/planning/decisions/` directory for ADRs

### 4. Display Planning Checklist

```markdown
## Planning Phase Checklist

### Architecture Design
- [ ] System architecture defined
- [ ] Component diagram created
- [ ] Data model designed
- [ ] API contracts specified
- [ ] Integration points identified

### Technology Selection
- [ ] Technology stack decided
- [ ] Framework choices documented
- [ ] Infrastructure requirements defined
- [ ] Third-party services selected

### Task Breakdown
- [ ] Features broken into tasks
- [ ] Dependencies identified
- [ ] Priority assigned
- [ ] Effort estimated (optional)

### Risk Assessment
- [ ] Technical risks identified
- [ ] Mitigation strategies defined
- [ ] Contingency plans created

### Documentation
- [ ] Architecture Decision Records (ADRs) created
- [ ] Design document drafted
- [ ] API documentation started
```

### 5. Invoke Architecture Planner

Suggest using the `architecture-planner` skill:

```
I can help design the architecture. Would you like me to:
1. Create a system architecture based on requirements
2. Design the data model (Prisma schema)
3. Define API contracts
4. Evaluate technology options

Use the architecture-planner skill for detailed guidance.
```

### 6. Suggested Prompts

```
"Design the architecture for [feature/system]"
"Break down [feature] into implementation tasks"
"What risks should we consider for [approach]?"
"Create an ADR for choosing [technology/approach]"
"Define the API contract for [endpoint]"
"Evaluate [option A] vs [option B] for [requirement]"
```

## Output

```markdown
## Planning Phase Initialized

**Status**: Ready for architecture and planning

### Discovery Summary
[Show summary from discovery phase if available]

### Workspace Created
- docs/planning/architecture.md
- docs/planning/tasks.md
- docs/planning/risks.md
- docs/planning/decisions/

### Next Steps
1. Define system architecture
2. Create component design
3. Break down into tasks
4. Assess risks
5. Document decisions (ADRs)

### Templates Available
- Architecture: `docs/phases/02-planning/architecture-template.md`
- Task breakdown: `docs/phases/02-planning/task-breakdown.md`
- Risk assessment: `docs/phases/02-planning/risk-assessment.md`
- ADR template: `docs/templates/adr-template.md`

### Skills Available
- `/architecture-planner` - Design system architecture

What aspect of planning would you like to start with?
```

## Validation Requirements

### Entry Validation
Before starting planning, verify discovery outputs are valid:
```
"Validate discovery documents"
```

If discovery validation fails, address issues before proceeding.

### During Planning Validation
After generating each artifact, validate it:

| Artifact | Validation |
|----------|-----------|
| Architecture design | TypeScript compiles, follows patterns |
| Database schema | Valid Prisma schema, relationships correct |
| API contracts | REST conventions, proper response formats |
| Task breakdown | Tasks are atomic and testable |

### Exit Gate Validation
Before proceeding to `/start-implementation`:

- [ ] Architecture document reviewed for React/Express patterns
- [ ] Database schema (Prisma) has proper relations and indexes
- [ ] API design follows REST conventions
- [ ] All ADRs documented with rationale
- [ ] Tasks are broken down to < 1 day each
- [ ] Risks identified with mitigation strategies

Run the `validator` skill:
```
"Validate the planning documents before implementation"
```
