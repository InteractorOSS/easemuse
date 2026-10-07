# Run Review

Execute comprehensive code review workflow.

## Instructions

When this command is invoked, perform the following:

### 1. Determine Review Scope

Ask or detect:
- Specific files to review
- Recent changes (git diff)
- Pull request scope
- Full codebase review

### 2. Execute Review Workflow

#### Step 1: Code Quality Review
Use the `code-review` skill to analyze:
- Code style adherence
- Naming conventions
- Function complexity
- DRY violations
- Error handling

#### Step 2: Security Review
Use the `security-audit` skill to check:
- Input validation
- Authentication/authorization
- SQL injection risks
- XSS vulnerabilities
- Sensitive data exposure

#### Step 3: Test Coverage
Analyze test coverage:
- Check coverage percentage
- Identify untested code paths
- Review test quality

#### Step 4: Documentation Review
Check documentation:
- README accuracy
- API documentation
- Code comments
- CHANGELOG updates

### 3. Display Review Checklist

```markdown
## Code Review Checklist

### Code Quality
- [ ] Clear naming conventions
- [ ] Single responsibility principle
- [ ] No code duplication
- [ ] Proper error handling
- [ ] Consistent formatting

### Security
- [ ] Input validation present
- [ ] No hardcoded secrets
- [ ] Parameterized queries (Prisma)
- [ ] Output encoding for XSS
- [ ] Proper authentication

### Testing
- [ ] Tests exist for new code
- [ ] Edge cases covered
- [ ] Tests are meaningful
- [ ] Coverage threshold met

### Documentation
- [ ] Code comments where needed
- [ ] README updated
- [ ] API docs current
- [ ] CHANGELOG entry added

### Performance
- [ ] No obvious bottlenecks
- [ ] Efficient database queries
- [ ] Appropriate caching
- [ ] No memory leaks
```

### 4. Generate Review Report

```markdown
## Code Review Report

**Date**: [Date]
**Reviewer**: Claude AI
**Scope**: [Files/PR description]

### Summary
- **Overall Assessment**: [APPROVE | REQUEST_CHANGES | COMMENT]
- **Critical Issues**: X
- **Suggestions**: X
- **Notes**: X

### Critical Issues (Must Fix)
1. [Issue with location and fix suggestion]

### Suggestions (Should Fix)
1. [Suggestion with reasoning]

### Minor Notes
1. [Optional improvements]

### Positive Highlights
- [Good practices observed]

### Test Coverage
- Current: X%
- Required: 80%
- Status: [Pass/Fail]

### Security Findings
- [Any security concerns]

### Next Steps
1. [Action items]
```

## Output

```markdown
## Review Workflow Started

**Review Type**: [Full/Diff/PR]
**Files in Scope**: [Count or list]

### Running Checks...

1. Code Quality Analysis
   - Analyzing code style...
   - Checking complexity...
   - Finding duplication...

2. Security Audit
   - Scanning for vulnerabilities...
   - Checking for secrets...
   - Validating input handling...

3. Test Analysis
   - Calculating coverage...
   - Reviewing test quality...

4. Documentation Check
   - Verifying README...
   - Checking API docs...

### Review Complete

[Full review report]

### Quick Actions
- "Fix the critical issues"
- "Improve test coverage for [file]"
- "Add documentation for [function]"
- "Explain [finding] in more detail"
```

## Validation Requirements

### Automated Validation Suite

Run ALL validation commands during review:

```bash
# Build
npm run build

# Formatting
npm run format:check

# Linting
npm run lint

# Type Checking
npm run typecheck

# Security Scan
npm audit

# Tests with Coverage
npm run test:coverage

# Dependency Audit
npm audit
```

### Review Validation Checklist

| Check | Command | Required |
|-------|---------|----------|
| Builds | `npm run build` | MUST PASS |
| Formatted | `npm run format:check` | MUST PASS |
| Lint Passes | `npm run lint` | MUST PASS |
| Types Valid | `npm run typecheck` | MUST PASS |
| Tests Pass | `npm test` | MUST PASS |
| Coverage >= 80% | `npm run test:coverage` | MUST PASS |
| No Audit Issues | `npm audit` | SHOULD PASS |

### Validation Report Format

Generate a validation report showing:

```markdown
## Validation Results

### Required Checks
- PASS: Build (0 errors)
- PASS: Formatting
- PASS: Linting (0 warnings)
- PASS: Type Check
- PASS: Tests (42 tests, 0 failures)
- PASS: Coverage (87.3%)

### Quality Checks
- PASS: npm audit (0 vulnerabilities)
- WARN: 2 low-severity findings

### Summary
**Status**: READY FOR DEPLOYMENT
**Blockers**: 0
**Warnings**: 2
```

### Exit Gate Validation
Before proceeding to `/prepare-release`:

- [ ] All required checks pass
- [ ] Security findings addressed or documented
- [ ] Test coverage meets threshold
- [ ] No critical code review findings
- [ ] Documentation is up to date

Run the `validator` skill:
```
"Run full validation before deployment"
```
