---
name: validator
description: Validate artifacts, code, and deliverables for correctness at each development phase. Use this skill proactively after generating any output to ensure quality and correctness.
---

# Validator Skill

Ensure correctness of all generated artifacts throughout the development lifecycle.

## When to Use

- **After generating any artifact** (requirements, designs, code, tests)
- **Before transitioning phases** (discovery -> planning -> implementation)
- **After code generation** (components, services, API routes)
- **Before commits and PRs**
- **On demand** when user requests validation

## Validation Types

### 1. Requirements Validation

After generating requirements or user stories:

```markdown
## Requirements Validation Checklist

### Completeness
- [ ] All user types/personas identified
- [ ] Happy path and edge cases covered
- [ ] Non-functional requirements specified (performance, security, scalability)
- [ ] Acceptance criteria defined for each requirement
- [ ] Dependencies between requirements identified

### Clarity
- [ ] No ambiguous language ("should", "might", "could" -> "must", "will")
- [ ] Measurable success criteria
- [ ] Clear scope boundaries (what's NOT included)
- [ ] Technical terms defined

### Consistency
- [ ] No contradicting requirements
- [ ] Terminology used consistently
- [ ] Aligns with stated problem/opportunity

### Feasibility
- [ ] Technically achievable with chosen stack
- [ ] Resource requirements realistic
- [ ] Timeline considerations noted
```

### 2. Architecture Validation

After generating architecture or design documents:

```markdown
## Architecture Validation Checklist

### Technical Correctness
- [ ] Components have clear responsibilities
- [ ] No circular dependencies between modules
- [ ] Data model supports all identified use cases
- [ ] API design follows REST conventions
- [ ] Database schema is normalized appropriately

### React/Express Specific
- [ ] Component hierarchy is logical
- [ ] State management approach is appropriate
- [ ] API routes follow Express best practices
- [ ] Prisma schema has proper relations and indexes
- [ ] Real-time patterns defined (Socket.io if needed)

### Scalability
- [ ] Identified potential bottlenecks
- [ ] Caching strategy defined where needed
- [ ] Background job patterns appropriate (BullMQ)
- [ ] Database query patterns optimized

### Security
- [ ] Authentication flow secure
- [ ] Authorization boundaries clear
- [ ] Input validation at boundaries
- [ ] Sensitive data handling defined
```

### 3. Code Validation

After generating any code:

```markdown
## Code Validation Checklist

### Syntax & Compilation
- [ ] Code compiles without errors (`npm run build`)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Formatting correct (`npm run format:check`)
- [ ] Linting passes (`npm run lint`)

### TypeScript Best Practices
- [ ] Proper type annotations (no implicit any)
- [ ] Interfaces/types for data structures
- [ ] Consistent error handling patterns
- [ ] Async/await used correctly
- [ ] No anti-patterns (deeply nested conditionals, magic values)

### React Patterns
- [ ] Functional components with hooks
- [ ] Proper prop typing
- [ ] Custom hooks for reusable logic
- [ ] Components are reasonably sized

### Express Patterns
- [ ] Controllers are thin, services handle logic
- [ ] Middleware used appropriately
- [ ] Error handling middleware in place
- [ ] Routes organized logically

### Prisma Correctness
- [ ] Schema is valid (`npx prisma validate`)
- [ ] Migrations work (`npx prisma migrate dev`)
- [ ] Relations are correct
- [ ] Appropriate indexes defined
```

### 4. Test Validation

After generating tests:

```markdown
## Test Validation Checklist

### Coverage
- [ ] All public service functions tested
- [ ] Happy path and error cases covered
- [ ] Edge cases identified and tested
- [ ] Component interactions tested

### Test Quality
- [ ] Tests are independent (no shared state)
- [ ] Factories/fixtures used consistently
- [ ] Meaningful assertions (not just "doesn't crash")
- [ ] Descriptive test names

### Execution
- [ ] All tests pass (`npm test`)
- [ ] No flaky tests
- [ ] Coverage meets threshold (`npm run test:coverage`)
```

### 5. Database Migration Validation

After generating Prisma migrations:

```markdown
## Migration Validation Checklist

### Correctness
- [ ] Table and column names follow convention (snake_case in DB)
- [ ] Primary keys correct
- [ ] Foreign keys reference correct tables
- [ ] Indexes created for foreign keys and query patterns
- [ ] Constraints defined (unique, not null)

### Safety
- [ ] Schema is valid (`npx prisma validate`)
- [ ] Migration works (`npx prisma migrate dev`)
- [ ] Prisma client generates (`npx prisma generate`)
- [ ] No data loss for existing data
- [ ] Default values set for new non-null columns

### Verification
- [ ] Migration runs successfully
- [ ] Rollback considerations documented
- [ ] Prisma Studio shows correct schema
```

## Validation Commands

Run these commands to validate generated code:

```bash
# Compilation & Types
npm run build
npm run typecheck

# Formatting & Linting
npm run format:check
npm run lint

# Tests
npm test
npm run test:coverage

# Security
npm audit

# Database
npx prisma validate
npx prisma generate
npx prisma migrate dev
```

## Automated Validation Process

When validating any artifact, follow this process:

### Step 1: Identify Artifact Type
Determine what was generated (requirements, code, tests, etc.)

### Step 2: Run Appropriate Checklist
Apply the matching validation checklist above

### Step 3: Execute Automated Checks
For code artifacts, run the relevant npm commands

### Step 4: Report Findings
Present validation results in this format:

```markdown
## Validation Report

**Artifact**: [What was validated]
**Type**: [Requirements | Architecture | Code | Tests | Migration]
**Status**: [PASS | FAIL | WARNINGS]

### Checks Passed
- [Check 1]
- [Check 2]

### Issues Found
- [Issue 1]: [Description and fix]
- [Issue 2]: [Description and fix]

### Warnings
- [Warning 1]: [Recommendation]

### Commands Executed
```bash
[Commands run and their output]
```

### Recommended Actions
1. [Action 1]
2. [Action 2]
```

### Step 5: Fix Issues
If issues are found:
1. Describe the problem clearly
2. Propose a fix
3. Apply the fix after user confirmation
4. Re-validate

## Integration Points

### After `/start-discovery`
Validate requirements completeness and clarity

### After `/start-planning`
Validate architecture correctness and consistency

### After `/start-implementation`
Validate generated code compiles and follows patterns

### After `/run-review`
Validate code quality, tests, and security

### After `/prepare-release`
Validate deployment readiness

## Usage Examples

```
"Validate the user stories I just created"
"Check if this Prisma schema is correct"
"Validate the UserService code"
"Run full validation before I commit"
"Check if these tests are comprehensive"
```
