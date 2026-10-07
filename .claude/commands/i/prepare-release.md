# Prepare Release

Prepare for deployment with comprehensive release checklist and validation.

## Instructions

When this command is invoked, perform the following:

### 1. Entry Validation

Before starting release preparation, verify all review checks passed:
```
"Run full validation before deployment"
```

### 2. Gather Release Information

Ask for:
- Version number (semantic versioning)
- Release type (major/minor/patch)
- Target environment (staging/production)

### 3. Execute Pre-Release Validation

Run ALL validation commands - every check must pass:

```bash
# Required - ALL MUST PASS
npm run build                   # Zero errors
npm run format:check            # Code formatted
npm run lint                    # No lint errors
npm run typecheck               # No type errors
npm test                        # All tests pass
npm run test:coverage           # Coverage >= 80%

# Security - MUST PASS
npm audit                       # No security issues

# Production Build - MUST PASS
npm run build:prod              # Production build succeeds
```

### 4. Pre-Release Checklist

#### Code Quality
- [ ] All tests passing (`npm test`)
- [ ] Code coverage >= 80% (`npm run test:coverage`)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Code formatted (`npm run format:check`)
- [ ] No lint errors (`npm run lint`)

#### Security
- [ ] Security audit passed (`npm audit`)
- [ ] No vulnerable dependencies
- [ ] No secrets in codebase
- [ ] Environment variables documented

#### Documentation
- [ ] CHANGELOG updated
- [ ] README current
- [ ] API docs updated
- [ ] Migration guide (if breaking changes)

### 5. Display Release Checklist

```markdown
## Release Checklist v[VERSION]

### Pre-Release Validation (ALL MUST PASS)
| Check | Command | Status |
|-------|---------|--------|
| Builds | `npm run build` | |
| Formatted | `npm run format:check` | |
| Lint | `npm run lint` | |
| Types | `npm run typecheck` | |
| Tests | `npm test` | |
| Coverage | `npm run test:coverage` (>=80%) | |
| Security | `npm audit` | |
| Prod Build | `npm run build:prod` | |

### Documentation
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] README.md current
- [ ] API documentation updated
- [ ] Release notes drafted

### Configuration
- [ ] Environment variables documented in `.env.example`
- [ ] Production config verified
- [ ] Secrets configured in deployment environment
- [ ] Feature flags configured (if applicable)

### Database
- [ ] Migrations tested on staging (`npx prisma migrate deploy`)
- [ ] Rollback tested
- [ ] Backup verified
- [ ] Data migration plan (if needed)

### Infrastructure
- [ ] Production build succeeds
- [ ] Health check endpoint responds (`/health` or `/api/health`)
- [ ] Rollback procedure documented
- [ ] Monitoring/alerting configured

### Communication
- [ ] Team notified
- [ ] Stakeholders informed
- [ ] Support team briefed
- [ ] Status page ready

### Post-Deployment Plan
- [ ] Smoke tests defined
- [ ] Monitoring dashboard ready
- [ ] Rollback criteria defined
- [ ] On-call schedule confirmed
```

### 6. Generate Release Notes

```markdown
## Release Notes v[VERSION]

**Release Date**: [Date]
**Release Type**: [Major/Minor/Patch]

### Highlights
- [Key feature or change]

### New Features
- [Feature 1]
- [Feature 2]

### Improvements
- [Improvement 1]

### Bug Fixes
- [Fix 1]

### Breaking Changes
- [Breaking change with migration guide]

### Security Updates
- [Security fix]

### Dependencies Updated
- [Dependency changes]

### Known Issues
- [Any known issues]

### Upgrade Guide
[Steps to upgrade from previous version]
```

### 7. Use Deployment Skill

Invoke the `deployment` skill for:
- Detailed deployment procedures
- Monitoring setup
- Rollback procedures

## Output

```markdown
## Release Preparation Started

**Version**: v[VERSION]
**Type**: [Major/Minor/Patch]
**Target**: [Environment]

### Running Pre-Release Validation...

#### Validation Results
| Check | Status | Output |
|-------|--------|--------|
| Build | PASS | 0 errors |
| Formatting | PASS | All files formatted |
| Lint | PASS | 0 warnings |
| Types | PASS | No errors |
| Tests | PASS | 42 tests, 0 failures |
| Coverage | PASS | 87.3% |
| Security | PASS | No vulnerabilities |
| Prod Build | PASS | Build created |

### Database Validation
- Migrations: Run successfully
- Rollback: Tested successfully

### Checklist Status
- [X] All validation checks pass
- [X] Security audit complete
- [ ] CHANGELOG updated
- [ ] Version bumped in package.json
- [ ] Release notes drafted

### Actions Required
1. Update CHANGELOG.md with release notes
2. Bump version in package.json
3. Create release notes
4. Tag release in git

### Quick Actions
- "Update the CHANGELOG for this release"
- "Generate release notes"
- "Create the git tag for v[VERSION]"
- "Review the deployment checklist"

Ready to proceed with release preparation?
```

## Deployment Validation

### Pre-Deployment Validation (Staging)

Before deploying to production, validate on staging:

```bash
# Build for production
npm run build:prod

# Run production build locally
npm run start:prod

# Run staging validation
curl -f https://staging.example.com/api/health

# Run smoke tests against staging
npm run test:e2e -- --env staging
```

### Production Deployment Validation

After deploying to production:

```bash
# Health check
curl -f https://production.example.com/api/health

# Verify application started
# Check logs for successful boot

# Run smoke tests
npm run test:smoke
```

### Post-Deployment Validation Checklist

- [ ] Health endpoint responds (200 OK)
- [ ] Application logs show successful startup
- [ ] Database connections established
- [ ] Background jobs running (if applicable)
- [ ] No errors in error tracking (Sentry, etc.)
- [ ] Metrics flowing to monitoring (if configured)

### Rollback Validation

If rollback is needed:

```bash
# Rollback database migrations
npx prisma migrate rollback

# Deploy previous release
# (depends on deployment platform)

# Verify rollback successful
curl -f https://production.example.com/api/health
```

### Validation Report

Generate a deployment validation report:

```markdown
## Deployment Validation Report

**Version**: v[VERSION]
**Date**: YYYY-MM-DD HH:MM UTC
**Environment**: Production
**Deployer**: [Name/Claude]

### Pre-Deployment Validation
| Check | Status |
|-------|--------|
| npm run build | PASS |
| npm run format:check | PASS |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm test | PASS (X tests) |
| npm run test:coverage | PASS (X%) |
| npm audit | PASS |
| npm run build:prod | PASS |

### Staging Validation
| Check | Status |
|-------|--------|
| Health endpoint | PASS |
| Smoke tests | PASS |
| Database migrations | PASS |

### Production Validation
| Check | Status |
|-------|--------|
| Deployment | SUCCESS |
| Health endpoint | PASS |
| Application logs | Normal |
| Error rate | < 0.1% |
| Response time | p99 < 200ms |

### Summary
**Status**: DEPLOYMENT SUCCESSFUL
**Rollback Required**: No
**Issues**: None

### Monitoring Links
- Dashboard: [URL]
- Logs: [URL]
- Errors: [URL]
```

## Exit Gate

Deployment is complete when:
- [ ] All pre-deployment validation passed
- [ ] Staging deployment validated
- [ ] Production deployment successful
- [ ] Health checks passing
- [ ] No elevated error rates
- [ ] Monitoring confirmed active
- [ ] Stakeholders notified
