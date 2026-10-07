# Handle Change Request

Process a change to requirements, design, or implementation after initial phases are complete.

## When to Use

- Requirements changed after planning started
- Design needs revision during implementation
- Bug or issue discovered that requires architectural changes
- Stakeholder requested scope change
- Post-deployment feature request or issue

## Process

### Step 1: Understand the Change

Ask the user:
1. What triggered this change? (new requirement, bug, feedback, etc.)
2. What is the current state?
3. What should the new state be?
4. How urgent is this? (P0-P3)

### Step 2: Assess Impact

Evaluate what's affected:

| Check | Question |
|-------|----------|
| Architecture | Does this change the system design? |
| Database | Does this require schema changes? |
| API | Does this change external contracts? |
| Dependencies | What else depends on the affected code? |
| Tests | What tests need updating? |

### Step 3: Determine Approach

Based on impact:

**Small Change (same architecture)**:
- Update code directly
- Update affected tests
- Run validation
- Document in commit message

**Medium Change (design adjustments)**:
- Create brief change record
- Update design doc if needed
- Implement changes
- Full validation cycle
- Update documentation

**Large Change (architecture impact)**:
- Create formal change request using `docs/templates/change-request-template.md`
- Go back to Planning phase
- Create/update ADR
- Revise design document
- Re-estimate affected tasks
- Resume implementation

### Step 4: Execute Mini-Cycle

```
Assess -> Plan -> Implement -> Test -> Review -> Validate
```

1. **Plan**: Create task list for the change
2. **Implement**: Make changes following existing patterns
3. **Test**: Update and run tests
4. **Review**: Self-review or request code review
5. **Validate**: Run full validation suite

### Step 5: Document

For any non-trivial change:

```markdown
## Change Record

**Date**: [Today]
**Type**: [Requirement/Architecture/Implementation/Hotfix]
**Triggered by**: [Reason]

### Summary
[One line description]

### What Changed
- [Change 1]
- [Change 2]

### Documents Updated
- [ ] Requirements doc
- [ ] ADR
- [ ] Design doc
- [ ] Tests
```

### Step 6: Validate

Run full validation:

```bash
npm run build
npm run lint
npm run typecheck
npm test
npm run test:coverage
```

## Output

After processing a change request, provide:

1. **Impact Summary**: What was affected
2. **Approach Taken**: How the change was handled
3. **Changes Made**: List of modifications
4. **Validation Results**: All checks passed
5. **Documentation Updates**: What was updated
6. **Recommendations**: Any follow-up items

## Examples

### Example 1: Small Requirement Change

User: "We need to add an email field to the user profile"

Response:
- Impact: Small (adds field, no architecture change)
- Approach: Direct implementation
- Tasks: Add field to Prisma schema, update form, add validation, update tests
- No ADR needed

### Example 2: Architecture Change

User: "We need to switch from polling to WebSockets for real-time updates"

Response:
- Impact: Large (changes communication pattern)
- Approach: Go back to Planning
- Create ADR documenting the decision
- Update design doc with new architecture (Socket.io integration)
- Re-estimate implementation tasks
- Then resume implementation

### Example 3: Post-Deployment Bug

User: "Users report data loss when saving forms"

Response:
- Impact: P0 Critical - needs immediate fix
- Approach: Hotfix cycle
  1. Reproduce and identify root cause
  2. Implement fix
  3. Add regression test
  4. Deploy hotfix
  5. Post-mortem and documentation
