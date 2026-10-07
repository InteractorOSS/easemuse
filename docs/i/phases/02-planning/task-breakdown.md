# Task Breakdown

## Project Information

| Field | Value |
|-------|-------|
| **Project Name** | [Name] |
| **Sprint/Milestone** | [Name] |
| **Date** | [Date] |

---

## Epic Overview

| Epic ID | Name | Priority | Status |
|---------|------|----------|--------|
| E-001 | [Epic Name] | High | In Progress |
| E-002 | [Epic Name] | Medium | Not Started |
| E-003 | [Epic Name] | Low | Not Started |

---

## Task Breakdown by Epic

### Epic: E-001 - [Epic Name]

**Description**: [Brief description of the epic]

**Goal**: [What success looks like]

#### Features & Tasks

##### Feature: [Feature Name]

| Task ID | Task | Owner | Priority | Estimate | Status | Dependencies |
|---------|------|-------|----------|----------|--------|--------------|
| T-001 | [Task description] | [Name] | High | [Est] | Todo | - |
| T-002 | [Task description] | [Name] | High | [Est] | Todo | T-001 |
| T-003 | [Task description] | [Name] | Medium | [Est] | Todo | T-001 |
| T-004 | [Task description] | [Name] | Medium | [Est] | Todo | T-002, T-003 |

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

---

##### Feature: [Feature Name 2]

| Task ID | Task | Owner | Priority | Estimate | Status | Dependencies |
|---------|------|-------|----------|----------|--------|--------------|
| T-005 | [Task description] | [Name] | High | [Est] | Todo | - |
| T-006 | [Task description] | [Name] | Medium | [Est] | Todo | T-005 |

---

### Epic: E-002 - [Epic Name]

**Description**: [Brief description]

#### Features & Tasks

##### Feature: [Feature Name]

| Task ID | Task | Owner | Priority | Estimate | Status | Dependencies |
|---------|------|-------|----------|----------|--------|--------------|
| T-007 | [Task description] | [Name] | High | [Est] | Todo | E-001 |
| T-008 | [Task description] | [Name] | Medium | [Est] | Todo | T-007 |

---

## Dependency Graph

```
T-001 ───┬──► T-002 ───┐
         │             ├──► T-004 ───► T-007
         └──► T-003 ───┘

T-005 ───► T-006
```

---

## Task Template

### T-[NUMBER]: [Task Title]

**Epic**: [Epic ID]
**Feature**: [Feature Name]
**Priority**: High / Medium / Low
**Estimate**: [Hours / Points / T-shirt size]
**Owner**: [Assignee]
**Status**: Todo / In Progress / Review / Done

**Description**:
[Detailed description of what needs to be done]

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

**Technical Notes**:
[Any technical details or considerations]

**Dependencies**:
- Blocked by: [Task IDs]
- Blocks: [Task IDs]

---

## Sprint Planning

### Sprint [N]: [Sprint Name]

**Duration**: [Start Date] - [End Date]
**Goal**: [Sprint goal]
**Capacity**: [Available hours/points]

| Task ID | Task | Owner | Estimate | Status |
|---------|------|-------|----------|--------|
| T-001 | [Task] | [Name] | [Est] | Todo |
| T-002 | [Task] | [Name] | [Est] | Todo |
| T-003 | [Task] | [Name] | [Est] | Todo |

**Total**: [Sum of estimates]

---

## Estimation Guidelines

### T-Shirt Sizing

| Size | Complexity | Typical Duration |
|------|------------|------------------|
| XS | Trivial, < 1 hour | < 1 hour |
| S | Simple, well-understood | 1-4 hours |
| M | Moderate complexity | 0.5-2 days |
| L | Complex, some unknowns | 2-5 days |
| XL | Very complex, many unknowns | 1-2 weeks |
| XXL | Too large - split it | N/A |

### Story Points (Fibonacci)

| Points | Description |
|--------|-------------|
| 1 | Trivial change |
| 2 | Simple, small scope |
| 3 | Small with some complexity |
| 5 | Medium complexity |
| 8 | Complex, significant effort |
| 13 | Very complex |
| 21+ | Should be broken down |

---

## Priority Matrix

```
                    URGENCY
                Low            High
           ┌─────────────┬─────────────┐
      High │   PLAN      │   DO NOW    │
           │   (P2)      │   (P1)      │
IMPORTANCE ├─────────────┼─────────────┤
           │  DELEGATE   │   SCHEDULE  │
      Low  │   (P4)      │   (P3)      │
           └─────────────┴─────────────┘
```

---

## Definition of Done

### For Individual Tasks
- [ ] Code complete and follows style guide
- [ ] Unit tests written and passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No new warnings or errors

### For Features
- [ ] All tasks completed
- [ ] Integration tests passing
- [ ] Feature tested on staging
- [ ] Product owner sign-off

### For Sprints
- [ ] All committed items done
- [ ] Demo completed
- [ ] Retrospective held
- [ ] Backlog updated

---

## Progress Tracking

### Burndown Template

| Day | Planned | Actual | Remaining |
|-----|---------|--------|-----------|
| 1 | 40 | 40 | 40 |
| 2 | 36 | 38 | 38 |
| 3 | 32 | 35 | 35 |
| 4 | 28 | 30 | 30 |
| 5 | 24 | 28 | 28 |
| ... | ... | ... | ... |

### Status Summary

| Status | Count | Points |
|--------|-------|--------|
| Todo | [N] | [P] |
| In Progress | [N] | [P] |
| In Review | [N] | [P] |
| Done | [N] | [P] |
| **Total** | **[N]** | **[P]** |
