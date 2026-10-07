# Quality Gates

## Overview

Quality gates are checkpoints that code must pass before progressing through the development pipeline. They ensure consistent quality standards are maintained.

---

## Gate Levels

### Level 1: Local Development

**When**: Before committing code

| Check | Requirement | Tool |
|-------|-------------|------|
| Linting | No errors | ESLint / Pylint |
| Type Checking | No errors | TypeScript / mypy |
| Unit Tests | All passing | Jest / pytest |
| Code Format | Properly formatted | Prettier / Black |

**Commands:**
```bash
npm run lint
npm run type-check
npm test
npm run format:check
```

---

### Level 2: Pull Request

**When**: Before merging to develop/main

| Check | Requirement | Tool |
|-------|-------------|------|
| All Level 1 checks | Passing | CI |
| Code Coverage | ≥ 80% overall | Istanbul / coverage.py |
| New Code Coverage | ≥ 80% | CI |
| Integration Tests | All passing | CI |
| Code Review | ≥ 1 approval | GitHub |
| No Conflicts | Clean merge | Git |

**Automated Checks:**
- CI/CD pipeline runs all tests
- Coverage report generated
- Security scan (dependencies)
- Build verification

---

### Level 3: Pre-Staging

**When**: Before deploying to staging

| Check | Requirement | Tool |
|-------|-------------|------|
| All Level 2 checks | Passing | CI |
| E2E Tests | All passing | Playwright |
| Performance Baseline | Within thresholds | k6 |
| Security Scan | No critical issues | Snyk |
| API Contract | Valid | OpenAPI |

---

### Level 4: Pre-Production

**When**: Before deploying to production

| Check | Requirement | Tool |
|-------|-------------|------|
| All Level 3 checks | Passing | CI |
| Staging Smoke Tests | All passing | Automated |
| Load Testing | Meets SLA | k6 |
| Security Audit | No critical/high | Manual + Tools |
| UAT Sign-off | Approved | Stakeholders |
| Documentation | Updated | Manual |
| Rollback Plan | Documented | Manual |

---

## Gate Definitions

### Code Coverage Gate

```yaml
coverage:
  global:
    statements: 80
    branches: 70
    functions: 85
    lines: 80
  critical_paths:
    statements: 100
    branches: 100
    functions: 100
    lines: 100
```

### Performance Gate

| Metric | Threshold | Action if Failed |
|--------|-----------|------------------|
| p50 Response Time | < 100ms | Warning |
| p95 Response Time | < 500ms | Block |
| p99 Response Time | < 1000ms | Block |
| Error Rate | < 0.1% | Block |
| Throughput | > 100 req/s | Warning |

### Security Gate

| Severity | Maximum Allowed | Action |
|----------|-----------------|--------|
| Critical | 0 | Block deployment |
| High | 0 | Block deployment |
| Medium | 5 | Warning, must fix within sprint |
| Low | 20 | Warning, backlog |

---

## Bypass Procedures

### Emergency Bypass
For critical production fixes only:

1. **Justification**: Document reason for bypass
2. **Approval**: Two senior engineers + Product Owner
3. **Scope**: Minimal change only
4. **Commitment**: Fix gaps within 24 hours
5. **Post-mortem**: Review why bypass was needed

### Bypass Request Template
```markdown
## Emergency Gate Bypass Request

**Date**: [Date]
**Requester**: [Name]

### Gate Being Bypassed
[Which gate and which check]

### Justification
[Why this is necessary]

### Risk Assessment
[What risks are we accepting]

### Mitigation Plan
[How we'll address this after deployment]

### Approvals
- [ ] Engineer 1: [Name]
- [ ] Engineer 2: [Name]
- [ ] Product Owner: [Name]
```

---

## Implementation

### CI/CD Pipeline Example

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  pull_request:
    branches: [main, develop]

jobs:
  # Level 1 + 2: PR Checks
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type Check
        run: npm run type-check

      - name: Unit Tests
        run: npm test -- --coverage

      - name: Check Coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80%"
            exit 1
          fi

      - name: Security Scan
        run: npm audit --audit-level=high

      - name: Build
        run: npm run build
```

---

## Monitoring Gates

### Dashboard Metrics

| Metric | Target | Current |
|--------|--------|---------|
| PRs passing first time | > 80% | |
| Average gate duration | < 10 min | |
| Bypass requests/month | < 2 | |
| Gate-related delays | < 5% | |

### Improvement Process

1. **Weekly**: Review gate metrics
2. **Monthly**: Analyze bypass requests
3. **Quarterly**: Adjust thresholds based on data

---

## Gate Failure Remediation

### Common Failures and Solutions

| Failure | Common Cause | Solution |
|---------|--------------|----------|
| Coverage drop | New untested code | Add tests before PR |
| Lint errors | Style violations | Run `npm run lint:fix` |
| Type errors | Missing types | Add proper type annotations |
| Security issues | Vulnerable deps | Update dependencies |
| Performance regression | Inefficient code | Profile and optimize |

### Escalation Path

1. **Developer**: Fix the issue
2. **Team Lead**: Help with complex issues
3. **Architect**: Approve architectural changes
4. **Management**: Approve bypass (emergency only)
