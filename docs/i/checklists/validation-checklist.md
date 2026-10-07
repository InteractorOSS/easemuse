# Validation Checklist

Use this checklist to validate all generated artifacts throughout the development lifecycle.

---

## Quick Reference

### Validation Commands (Elixir/Phoenix)

```bash
# Must pass - run after every code change
mix compile --warnings-as-errors
mix format --check-formatted
mix test

# Should pass - run before commits
mix credo --strict
mix test --cover

# Run before release
mix sobelow
mix dialyzer
mix hex.audit
```

---

## Phase 1: Discovery Validation

### Requirements Document
- [ ] **Problem statement** is a single, clear sentence
- [ ] **Users** are explicitly identified (not "users" but "admin users", "customers", etc.)
- [ ] **Each requirement** has acceptance criteria
- [ ] **No ambiguous words**: "should", "might", "could" → use "must", "will"
- [ ] **Success metrics** are quantifiable (numbers, percentages, time)
- [ ] **Scope** explicitly states what's NOT included
- [ ] **Constraints** are documented (technical, budget, timeline, regulatory)

### User Stories
- [ ] Follow format: "As a [user type], I want [feature] so that [benefit]"
- [ ] Each story is independently testable
- [ ] Stories have acceptance criteria
- [ ] Edge cases are identified
- [ ] Stories are prioritized (must have, should have, nice to have)

### Stakeholder Analysis
- [ ] All stakeholders identified
- [ ] Decision-making authority clear
- [ ] Communication channels defined

**Exit Gate**: All items checked before proceeding to Planning.

---

## Phase 2: Planning Validation

### Architecture Design
- [ ] **Phoenix contexts** have clear, single responsibilities
- [ ] **No circular dependencies** between contexts
- [ ] **Data model** supports all identified use cases
- [ ] **Associations** are correctly defined (has_many, belongs_to, many_to_many)
- [ ] **Indexes** planned for foreign keys and query patterns
- [ ] **API design** follows REST conventions

### Database Schema
- [ ] Table names are plural, snake_case
- [ ] Primary keys defined (`:binary_id` for UUIDs)
- [ ] Foreign keys reference correct tables
- [ ] Required fields have `null: false`
- [ ] Unique constraints where needed
- [ ] Indexes on foreign keys and frequently queried columns

### Task Breakdown
- [ ] Tasks are atomic (< 1 day of work)
- [ ] Tasks are independently testable
- [ ] Dependencies are identified
- [ ] Tasks are prioritized

### Architecture Decision Records (ADRs)
- [ ] Each significant decision has an ADR
- [ ] ADRs include: context, decision, rationale, consequences

**Exit Gate**: All items checked before proceeding to Implementation.

---

## Phase 3: Implementation Validation

### After Every Code Generation

Run immediately:
```bash
mix compile --warnings-as-errors
mix format --check-formatted
```

### Schema Validation
- [ ] Schema compiles without warnings
- [ ] Fields have correct types
- [ ] Associations are correct
- [ ] `timestamps()` included
- [ ] Primary key configured if non-default

```elixir
# Verify schema
MyApp.Accounts.User.__schema__(:fields)
MyApp.Accounts.User.__schema__(:associations)
```

### Migration Validation
- [ ] Migration runs: `mix ecto.migrate`
- [ ] Migration rolls back: `mix ecto.rollback`
- [ ] Migration runs again: `mix ecto.migrate`
- [ ] Indexes created for foreign keys
- [ ] Default values for new non-null columns

### Changeset Validation
- [ ] All required fields in `validate_required/2`
- [ ] Format validations where needed
- [ ] Length validations where needed
- [ ] Unique constraints
- [ ] Custom validations documented

### Context Validation
- [ ] Public functions are documented with `@doc`
- [ ] Functions return `{:ok, result}` or `{:error, reason}`
- [ ] Bang functions (`!`) used appropriately
- [ ] No business logic in controllers

### LiveView Validation
- [ ] Implements `mount/3`
- [ ] Implements `handle_params/3` if needed
- [ ] Implements `handle_event/3` for interactions
- [ ] Uses `stream/3` for lists
- [ ] Uses `assign/3` for state
- [ ] Form validation with `phx-change`

### Controller Validation
- [ ] Uses `action_fallback`
- [ ] Delegates to contexts
- [ ] Proper HTTP status codes
- [ ] Consistent response format

### Test Validation
- [ ] Tests pass: `mix test`
- [ ] Coverage adequate: `mix test --cover`
- [ ] Tests are independent (no shared state)
- [ ] Happy path tested
- [ ] Error cases tested
- [ ] Edge cases tested

**Exit Gate**: All items checked before proceeding to Review.

---

## Phase 4: Review Validation

### Automated Checks (ALL MUST PASS)

```bash
mix compile --warnings-as-errors   # ✓ Required
mix format --check-formatted       # ✓ Required
mix test                           # ✓ Required
mix test --cover                   # ✓ Required (≥80%)
mix credo --strict                 # ○ Recommended
mix sobelow                        # ○ Recommended
mix dialyzer                       # ○ Optional
mix hex.audit                      # ○ Recommended
```

### Code Quality
- [ ] No compiler warnings
- [ ] Code is formatted
- [ ] No Credo issues (or documented exceptions)
- [ ] No TODO comments (or tracked as issues)
- [ ] No commented-out code
- [ ] No hardcoded secrets

### Security
- [ ] Input validation at boundaries
- [ ] No SQL injection vulnerabilities
- [ ] Authentication checked where needed
- [ ] Authorization checked where needed
- [ ] Sensitive data not logged
- [ ] Sobelow findings addressed or documented

### Performance
- [ ] No N+1 queries (use preload)
- [ ] Indexes on frequently queried columns
- [ ] Large queries use pagination
- [ ] Background jobs for slow operations

### Documentation
- [ ] README is accurate
- [ ] API documentation current
- [ ] Code comments for "why" not "what"
- [ ] CHANGELOG updated

**Exit Gate**: All items checked before proceeding to Deployment.

---

## Phase 5: Deployment Validation

### Pre-Deployment
- [ ] All review validations pass
- [ ] Release builds successfully: `MIX_ENV=prod mix release`
- [ ] Database migrations tested on staging
- [ ] Environment variables documented
- [ ] Rollback procedure documented

### Post-Deployment
- [ ] Health check endpoint responds
- [ ] Smoke tests pass
- [ ] Monitoring/alerting active
- [ ] Error tracking active

---

## Validation Report Template

Copy and fill out after each validation:

```markdown
## Validation Report

**Date**: YYYY-MM-DD
**Phase**: [Discovery | Planning | Implementation | Review | Deployment]
**Validated By**: [Name/Claude]

### Checks Run
| Check | Status | Notes |
|-------|--------|-------|
| [Check 1] | ✓ PASS | |
| [Check 2] | ✗ FAIL | [Issue] |
| [Check 3] | ⚠ WARN | [Recommendation] |

### Commands Executed
```bash
mix compile --warnings-as-errors  # [output]
mix test                          # [output]
```

### Issues Found
1. **[Issue]**: [Description]
   - **Fix**: [How to fix]
   - **Status**: [Fixed | Pending]

### Warnings
1. **[Warning]**: [Description]
   - **Recommendation**: [Action]

### Summary
- **Status**: [PASS | FAIL]
- **Blockers**: [Count]
- **Warnings**: [Count]
- **Ready for next phase**: [Yes | No]
```

---

## Quick Validation Commands

### One-liner for pre-commit
```bash
mix format && mix compile --warnings-as-errors && mix credo --strict && mix test
```

### One-liner for full validation
```bash
mix format --check-formatted && mix compile --warnings-as-errors && mix credo --strict && mix test --cover && mix sobelow
```

### Create a mix alias (add to mix.exs)
```elixir
defp aliases do
  [
    validate: [
      "format --check-formatted",
      "compile --warnings-as-errors",
      "credo --strict",
      "test --cover"
    ],
    "validate.full": [
      "validate",
      "sobelow",
      "dialyzer"
    ]
  ]
end
```

Then run: `mix validate` or `mix validate.full`
