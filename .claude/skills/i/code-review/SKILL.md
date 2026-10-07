---
name: code-review
description: Perform comprehensive code review analyzing quality, security, performance, and best practices. Use during code review phase or when reviewing specific files.
---

# Code Review Skill

Comprehensive code analysis for quality, security, and best practices.

## When to Use

- During `/run-review` phase
- When reviewing pull requests
- On-demand code quality analysis
- Before merging changes

## Review Process

### Step 1: Gather Context

1. Identify files to review
2. Understand the purpose of changes
3. Check related tests
4. Review recent commits

### Step 2: Analyze Code Quality

#### Naming and Clarity
- [ ] Variable names are descriptive
- [ ] Function names describe their action
- [ ] No abbreviations or cryptic names
- [ ] Consistent naming conventions

#### Structure
- [ ] Functions are focused (single responsibility)
- [ ] Files are reasonably sized (<300 lines)
- [ ] Code is DRY (no unnecessary duplication)
- [ ] Proper separation of concerns

#### TypeScript Usage
- [ ] No `any` types (or justified)
- [ ] Proper interface/type definitions
- [ ] Correct use of generics
- [ ] Proper error types

### Step 3: Check Best Practices

#### React Patterns
- [ ] Functional components with hooks
- [ ] Proper state management
- [ ] Memoization where needed
- [ ] Proper prop drilling avoidance

#### Express Patterns
- [ ] Thin controllers
- [ ] Business logic in services
- [ ] Proper middleware usage
- [ ] Consistent error handling

#### Database Patterns
- [ ] Efficient Prisma queries
- [ ] Proper relation handling
- [ ] Transaction usage where needed
- [ ] No N+1 query problems

### Step 4: Security Review

- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] Output encoding for user data
- [ ] Proper authentication checks
- [ ] Authorization verified

### Step 5: Performance Check

- [ ] No obvious bottlenecks
- [ ] Efficient algorithms
- [ ] Proper async handling
- [ ] No memory leaks
- [ ] Database queries optimized

### Step 6: Test Coverage

- [ ] Tests exist for new code
- [ ] Edge cases covered
- [ ] Tests are meaningful
- [ ] No test anti-patterns

## Review Checklist

```markdown
## Code Review Checklist

### Code Quality
- [ ] Clear naming conventions
- [ ] Single responsibility principle
- [ ] No code duplication
- [ ] Proper error handling
- [ ] Consistent formatting

### TypeScript
- [ ] No implicit any
- [ ] Proper type definitions
- [ ] Correct generic usage
- [ ] Type-safe error handling

### React (if applicable)
- [ ] Functional components
- [ ] Proper hook usage
- [ ] Appropriate memoization
- [ ] No prop drilling issues

### Express (if applicable)
- [ ] Thin controllers
- [ ] Service layer for logic
- [ ] Proper middleware
- [ ] Error middleware in place

### Security
- [ ] Input validation
- [ ] No hardcoded secrets
- [ ] Parameterized queries
- [ ] Output encoding

### Testing
- [ ] Tests for new code
- [ ] Edge cases covered
- [ ] Meaningful assertions
- [ ] Good test isolation

### Documentation
- [ ] Code comments where needed
- [ ] README updates
- [ ] API docs current
```

## Output Format

```markdown
## Code Review Report

**Files Reviewed**: [count]
**Date**: [date]
**Reviewer**: Claude AI

### Summary
- **Verdict**: [APPROVE | REQUEST_CHANGES | COMMENT]
- **Critical Issues**: [count]
- **Suggestions**: [count]
- **Notes**: [count]

### Critical Issues (Must Fix)

#### Issue 1: [Title]
**File**: `src/services/user.service.ts:45`
**Problem**: [Description]
**Impact**: [Why this matters]
**Fix**: [Suggested solution]

```typescript
// Before
const data = await fetch(url).then(r => r.json());

// After
try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
} catch (error) {
  throw new FetchError('Failed to fetch data', { cause: error });
}
```

### Suggestions (Should Consider)

#### Suggestion 1: [Title]
**File**: `src/components/UserList.tsx:23`
**Current**: [What it does now]
**Suggested**: [Better approach]
**Reason**: [Why this is better]

### Minor Notes

- [ ] Line 15: Consider more descriptive variable name
- [ ] Line 42: This could be extracted to a utility function

### Positive Highlights

- Good use of TypeScript generics in `useQuery` hook
- Well-structured error handling in auth middleware
- Comprehensive test coverage for UserService

### Test Coverage
- Current: 87%
- Required: 80%
- Status: PASS

### Files Changed
| File | Status | Issues |
|------|--------|--------|
| `src/services/user.service.ts` | Reviewed | 1 critical |
| `src/components/UserList.tsx` | Reviewed | 0 |
| `src/tests/user.test.ts` | Reviewed | 0 |

### Next Steps
1. Fix critical issue in user.service.ts
2. Consider suggestion for UserList.tsx
3. Run full test suite after changes
```

## Integration

### With `/run-review`
Automatically invoked as part of review workflow.

### With Security Audit
Coordinates with `security-audit` skill for deeper security analysis.

### With Test Generator
Identifies areas needing additional tests.
