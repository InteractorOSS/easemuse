# Phase 4: Testing

## Overview

The Testing phase ensures quality through comprehensive testing strategies, including unit tests, integration tests, and end-to-end tests.

## Objectives

- Verify functionality meets requirements
- Ensure code quality and reliability
- Identify and fix bugs early
- Meet coverage requirements
- Validate performance and security

---

## Test Types

### Unit Tests
- Test individual functions and components
- Fast, isolated, deterministic
- Cover business logic and utilities

### Integration Tests
- Test component interactions
- API endpoints and database operations
- External service integrations (mocked)

### End-to-End (E2E) Tests
- Test complete user workflows
- Critical user journeys
- Cross-browser testing

### Other Testing Types
- **Performance testing** - Load and stress tests
- **Security testing** - Vulnerability scanning
- **Accessibility testing** - WCAG compliance

---

## Coverage Requirements

| Metric | Minimum | Target |
|--------|---------|--------|
| Overall Coverage | 80% | 90% |
| Critical Paths | 100% | 100% |
| New Code | 80% | 95% |
| Branch Coverage | 70% | 85% |

### Critical Paths (100% Required)
- Authentication/authorization
- Payment processing
- Data mutations
- Security-sensitive operations

---

## Process

### Test-Driven Development (TDD)

```
┌─────────────────────────────────────┐
│                                     │
│  ┌─────────┐    ┌─────────┐        │
│  │  Write  │───►│   Run   │        │
│  │  Test   │    │  Test   │        │
│  └─────────┘    └─────────┘        │
│       ▲              │             │
│       │              ▼             │
│       │         ┌─────────┐        │
│       │         │  Fail?  │        │
│       │         └─────────┘        │
│       │              │             │
│       │         Yes  │  No         │
│       │              ▼             │
│       │         ┌─────────┐        │
│       │         │  Write  │        │
│       │         │  Code   │        │
│       │         └─────────┘        │
│       │              │             │
│       │              ▼             │
│       │         ┌─────────┐        │
│       └─────────│ Refactor│        │
│                 └─────────┘        │
│                                     │
└─────────────────────────────────────┘
```

### Testing Workflow

1. **Write tests first** (for new features)
2. **Run tests locally** before committing
3. **CI runs all tests** on PR
4. **Review test coverage** in PR
5. **Fix failing tests** before merge

---

## Checklist

### Test Planning
- [ ] Test scenarios identified
- [ ] Test data prepared
- [ ] Environment configured
- [ ] Dependencies mocked

### Test Implementation
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] E2E tests for critical paths
- [ ] Edge cases covered
- [ ] Error cases tested

### Test Quality
- [ ] Tests are readable
- [ ] Tests are independent
- [ ] No flaky tests
- [ ] Meaningful assertions

### Coverage
- [ ] Coverage meets threshold
- [ ] Critical paths at 100%
- [ ] New code fully tested
- [ ] No untested branches in critical code

---

## Templates

- [Test Plan Template](./test-plan-template.md)
- [Quality Gates](./quality-gates.md)

---

## AI Collaboration Tips

### Effective Prompts

```
"Generate test cases for this function:
[paste function]
Cover: happy path, edge cases, error conditions"
```

```
"Create integration tests for this API endpoint:
[paste endpoint code]
Include: success cases, validation errors, auth failures"
```

```
"Review these tests for completeness:
[paste tests]
What scenarios are missing?"
```

```
"Generate E2E test for this user flow:
1. User logs in
2. User navigates to settings
3. User updates profile
4. User sees success message"
```

---

## Related Rules

- `.claude/rules/testing.md` - Testing standards

## Related Skills

- `test-generator` - Generate test scaffolds
