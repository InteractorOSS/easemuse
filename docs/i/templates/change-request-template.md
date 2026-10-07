# Change Request Template

Use this template when requirements, design, or scope changes after initial planning or implementation.

---

## Change Request

**ID**: CR-[NUMBER]
**Date**: [YYYY-MM-DD]
**Requested By**: [Name/Role]
**Priority**: P0 (Critical) / P1 (High) / P2 (Medium) / P3 (Low)

---

## Summary

*One sentence describing the change*

```
[Brief description of what needs to change]
```

---

## Current State

*What exists today*

```
[Describe current implementation/design/requirement]
```

---

## Proposed Change

*What should change*

```
[Describe the desired end state]
```

---

## Reason for Change

*Why is this change needed?*

- [ ] New requirement from stakeholder
- [ ] Bug/defect discovered
- [ ] Performance issue
- [ ] Security vulnerability
- [ ] User feedback
- [ ] Technical debt
- [ ] External dependency change
- [ ] Other: [specify]

**Details**:
```
[Explain the driver behind this change]
```

---

## Impact Assessment

### Scope Impact

| Area | Affected? | Details |
|------|-----------|---------|
| Requirements | [ ] Yes / [ ] No | |
| Architecture | [ ] Yes / [ ] No | |
| Database schema | [ ] Yes / [ ] No | |
| API contracts | [ ] Yes / [ ] No | |
| UI/UX | [ ] Yes / [ ] No | |
| Tests | [ ] Yes / [ ] No | |
| Documentation | [ ] Yes / [ ] No | |
| Deployment | [ ] Yes / [ ] No | |

### Files/Components Affected

```
[List specific files, modules, or components that need changes]
- lib/my_app/context/...
- lib/my_app_web/live/...
- priv/repo/migrations/...
```

### Dependencies

```
[Other features/components that depend on this, or that this depends on]
```

---

## Recommended Approach

### Option A: [Name] (Recommended)

**Description**: [What this approach involves]

**Pros**:
-

**Cons**:
-

**Effort**: [Small / Medium / Large]

### Option B: [Name]

**Description**: [Alternative approach]

**Pros**:
-

**Cons**:
-

**Effort**: [Small / Medium / Large]

---

## Implementation Plan

### Phase to Revisit

- [ ] Discovery (requirements need updating)
- [ ] Planning (architecture/design changes)
- [ ] Implementation (code changes only)
- [ ] Testing (test updates only)
- [ ] None (documentation only)

### Tasks

```markdown
- [ ] [Task 1]
- [ ] [Task 2]
- [ ] [Task 3]
```

### Documents to Update

- [ ] Requirements document
- [ ] Architecture Decision Record (ADR)
- [ ] Design document
- [ ] API documentation
- [ ] User documentation
- [ ] Test plan

---

## Validation Checklist

After implementing the change:

```bash
# Must pass
mix compile --warnings-as-errors
mix format --check-formatted
mix test
mix credo --strict

# If architecture changed
# Review and update ADR

# If API changed
# Update API documentation
# Notify API consumers
```

---

## Rollback Plan

*If this change causes issues, how do we revert?*

```
[Describe rollback steps]
```

---

## Approval

| Role | Name | Approved | Date |
|------|------|----------|------|
| Tech Lead | | [ ] | |
| Product Owner | | [ ] | |
| QA Lead | | [ ] | |

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| | | Initial request |
| | | |

---

## Post-Implementation Review

*Fill out after the change is complete*

### What Went Well

```
[What worked about this change process]
```

### What Could Improve

```
[Lessons learned for future changes]
```

### Template Feedback

*Did this template help? What was missing?*

```
[Feedback for improving the change request template]
```
