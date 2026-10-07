# Release Validator Agent

Comprehensive pre-release validation agent. Runs all validation checks in parallel/sequence and returns a consolidated pass/fail report.

## Purpose

Execute complete validation suite before releases without filling main context with command outputs. Returns only the validation status and any failures that need attention.

## When to Use

- Before any release (via `/prepare-release`)
- End of code review (via `/run-review`)
- Before merging PRs
- CI/CD pipeline validation

## Capabilities

### Required Validation Commands

Execute ALL of these - every check must pass:

```bash
# TypeScript Compilation - MUST PASS
npm run typecheck              # or: npx tsc --noEmit

# Formatting - MUST PASS
npm run format:check           # or: npx prettier --check .

# Linting - MUST PASS
npm run lint                   # or: npx eslint .

# Tests - MUST PASS
npm test

# Coverage - MUST MEET THRESHOLD
npm run test:coverage          # >= 80%

# Security - MUST PASS
npm audit --audit-level=high

# Build - MUST PASS
npm run build
```

### Validation Categories

#### Required (Blockers)
- TypeScript compiles without errors
- Code formatting matches standards
- No ESLint errors
- All tests passing
- Coverage >= 80%
- No high/critical security vulnerabilities
- Production build succeeds

#### Recommended (Warnings)
- No ESLint warnings
- No TODO comments in code
- Documentation up to date
- No deprecated dependencies

### Database Validation

```bash
# Migration validation (if using Prisma)
npx prisma migrate deploy --dry-run    # Validate migrations
npx prisma generate                     # Ensure client is up to date
```

## Output Format

Return a structured validation report:

```markdown
## Release Validation Report

**Status**: READY | NOT_READY
**Blockers**: X
**Warnings**: X

### Required Checks
| Check | Command | Status | Details |
|-------|---------|--------|---------|
| TypeScript | `npm run typecheck` | PASS/FAIL | 0 errors |
| Formatting | `npm run format:check` | PASS/FAIL | |
| Linting | `npm run lint` | PASS/FAIL | 0 errors, 2 warnings |
| Tests | `npm test` | PASS/FAIL | 42 tests, 0 failures |
| Coverage | `npm run test:coverage` | PASS/FAIL | 87.3% (>= 80%) |
| Security | `npm audit` | PASS/FAIL | 0 vulnerabilities |
| Build | `npm run build` | PASS/FAIL | |

### Recommended Checks
| Check | Command | Status | Details |
|-------|---------|--------|---------|
| Lint Warnings | `npm run lint` | PASS/WARN | 2 warnings |
| TODO Comments | `grep -r TODO` | PASS/SKIP | 3 found |

### Database Checks
| Check | Status |
|-------|--------|
| Migrations valid | PASS |
| Prisma client generated | PASS |

### Blockers (Must Fix)
1. [Issue description with fix suggestion]

### Warnings (Should Fix)
1. [Warning description]

### Summary
- All required checks: PASS/FAIL
- Ready for release: YES/NO
- Recommended actions: [list]
```

## Parallel Execution Strategy

For efficiency, run independent checks in parallel:

**Parallel Group 1** (Code Quality):
- npm run typecheck
- npm run format:check
- npm run lint

**Parallel Group 2** (Security):
- npm audit

**Sequential** (Depends on compilation):
- npm test
- npm run test:coverage
- npm run build

## Integration Points

This agent is called by:
- `/prepare-release` command (main validation)
- `/run-review` command (final validation check)
- CI/CD pipelines (automated validation)

## Token Efficiency

This agent:
- Runs all commands but captures only status
- Returns structured pass/fail, not raw output
- Only includes failure details for failed checks
- Consolidates security-auditor and test-coverage results
- Estimated token savings: 70-80% vs running all validations in main context

## Failure Handling

On failure:
1. Identify the specific failing check
2. Extract relevant error message (first 10 lines)
3. Suggest fix if pattern is recognized
4. Return consolidated report with failures highlighted

## CI/CD Integration

Example GitHub Actions job:

```yaml
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm test -- --coverage
      - run: npm audit --audit-level=high
      - run: npm run build
```
