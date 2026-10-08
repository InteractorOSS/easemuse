# Release Checklist

Comprehensive checklist for React/Express releases with validation at every step.

## Release Information

| Field               | Value                          |
| ------------------- | ------------------------------ |
| **Version**         | [X.Y.Z]                        |
| **Date**            | [Date]                         |
| **Release Manager** | [Name]                         |
| **Type**            | Major / Minor / Patch / Hotfix |

---

## Pre-Release Validation (ALL MUST PASS)

### Code Quality

```bash
# Run all validation commands
npm run typecheck                   # Zero TypeScript errors
npm run format:check                # Code formatted
npm test                            # All tests pass
npm run test:coverage               # Coverage >= 80%
npm run lint                        # No lint errors
```

| Check               | Command                 | Status |
| ------------------- | ----------------------- | ------ |
| TypeScript compiles | `npm run typecheck`     | [ ]    |
| Code formatted      | `npm run format:check`  | [ ]    |
| All tests pass      | `npm test`              | [ ]    |
| Coverage >= 80%     | `npm run test:coverage` | [ ]    |
| No lint errors      | `npm run lint`          | [ ]    |

### Security (ALL MUST PASS)

```bash
npm audit --audit-level=high        # No high/critical vulnerabilities
```

| Check              | Command       | Status |
| ------------------ | ------------- | ------ |
| Security audit     | `npm audit`   | [ ]    |
| No secrets in code | Manual review | [ ]    |

### Database Validation

```bash
npx prisma migrate deploy --dry-run # Migrations valid
npx prisma generate                 # Client up to date
```

| Check                   | Command                               | Status |
| ----------------------- | ------------------------------------- | ------ |
| Migrations valid        | `npx prisma migrate deploy --dry-run` | [ ]    |
| Prisma client generated | `npx prisma generate`                 | [ ]    |

### Build (MUST PASS)

```bash
npm run build                       # Production build succeeds
```

| Check          | Command         | Status |
| -------------- | --------------- | ------ |
| Build succeeds | `npm run build` | [ ]    |

---

## One-Liner Validation

Run all validation at once:

```bash
npm run typecheck && \
npm run format:check && \
npm run lint && \
npm test -- --coverage && \
npm audit --audit-level=high && \
npm run build
```

Or add to `package.json`:

```json
{
  "scripts": {
    "release:validate": "npm run typecheck && npm run format:check && npm run lint && npm test -- --coverage && npm audit --audit-level=high && npm run build"
  }
}
```

Then run: `npm run release:validate`

---

## Documentation

- [ ] CHANGELOG.md updated with release notes
- [ ] Version bumped in `package.json`
- [ ] README.md current and accurate
- [ ] API documentation updated
- [ ] Migration guide written (if breaking changes)
- [ ] Release notes drafted

---

## Configuration

### Environment Variables

- [ ] Variables documented in `.env.example`
- [ ] Production environment variables set
- [ ] `JWT_SECRET` configured (strong, 64+ characters)
- [ ] `DATABASE_URL` configured
- [ ] `NODE_ENV=production` set

### Feature Flags

- [ ] Flags configured correctly
- [ ] Gradual rollout plan (if applicable)

### Database

- [ ] Migrations tested (`npx prisma migrate deploy`)
- [ ] Rollback tested
- [ ] Backup verified

---

## Infrastructure

### Deployment

- [ ] Build succeeds (`npm run build`)
- [ ] CI/CD pipeline configured
- [ ] Rollback procedure documented

### Monitoring

- [ ] Health endpoint configured (`/api/health`)
- [ ] Ready endpoint configured (`/api/health/ready`)
- [ ] Error tracking active (Sentry, etc.)
- [ ] Logging configured
- [ ] Alerts configured

### Scaling

- [ ] Database pool size configured
- [ ] Express concurrency appropriate
- [ ] Load balancer health checks configured

---

## Communication

### Internal

- [ ] Engineering team notified
- [ ] Support team briefed
- [ ] Stakeholders informed

### External

- [ ] Release notes prepared
- [ ] Status page ready
- [ ] Customer communication (if needed)

---

## Deployment Steps

### 1. Pre-Deployment (T-1 hour)

- [ ] Final code freeze
- [ ] Create release branch/tag
- [ ] Backup production database
- [ ] Notify team of deployment start
- [ ] Run `npm run release:validate`

### 2. Staging Deployment

- [ ] Deploy to staging
- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] Verify health endpoint: `curl -f https://staging.example.com/api/health`
- [ ] Run smoke tests
- [ ] Verify all features

### 3. Production Deployment

- [ ] Deploy to production
- [ ] Run migrations: `npx prisma migrate deploy`
- [ ] Verify health endpoint: `curl -f https://production.example.com/api/health`
- [ ] Run smoke tests
- [ ] Verify critical paths

### 4. Post-Deployment

- [ ] Check error rates
- [ ] Verify performance metrics
- [ ] Test key user flows
- [ ] Confirm background jobs processing (BullMQ)
- [ ] Verify monitoring active

---

## Smoke Tests

### Critical Paths (Must Pass)

- [ ] Health endpoint responds (200 OK)
- [ ] Ready endpoint shows all healthy
- [ ] User can log in
- [ ] User can log out
- [ ] [Critical feature 1]
- [ ] [Critical feature 2]

### Secondary Checks

- [ ] WebSocket connections stable (if applicable)
- [ ] Forms submit correctly
- [ ] Error pages display correctly
- [ ] Static assets loading

---

## Rollback Checklist

### Rollback Triggers

- [ ] Error rate > 5%
- [ ] Critical bug discovered
- [ ] Security issue found
- [ ] Data integrity problem
- [ ] Performance severely degraded

### Rollback Steps

```bash
# 1. Stop current deployment
# (Platform-specific - Vercel, Railway, Docker, etc.)

# 2. Rollback database (if migration caused issue)
# Note: Prisma migrations are forward-only by design
# Use a backup or manual SQL to revert if needed

# 3. Switch to previous deployment
# (Platform-specific - redeploy previous version)

# 4. Verify rollback
curl -f https://production.example.com/api/health
```

### Rollback Verification

- [ ] Health endpoint responds
- [ ] Error rates normalized
- [ ] Issue resolved
- [ ] Team notified
- [ ] Incident documented

---

## Post-Release

### Immediate (0-1 hour)

- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify background jobs processing
- [ ] Watch for support tickets

### Short-term (1-24 hours)

- [ ] Continue monitoring
- [ ] Address any issues
- [ ] Gather feedback
- [ ] Update documentation

### Follow-up (1-7 days)

- [ ] Review release metrics
- [ ] Document lessons learned
- [ ] Plan fixes for any issues
- [ ] Update runbooks

---

## Sign-offs

| Role             | Name | Date | Signature |
| ---------------- | ---- | ---- | --------- |
| Engineering Lead |      |      |           |
| QA Lead          |      |      |           |
| Product Owner    |      |      |           |
| DevOps           |      |      |           |

---

## Validation Report Template

```markdown
## Release Validation Report

**Version**: v[VERSION]
**Date**: YYYY-MM-DD HH:MM UTC
**Deployer**: [Name]

### Pre-Deployment Validation

| Check      | Command                 | Status           |
| ---------- | ----------------------- | ---------------- |
| TypeScript | `npm run typecheck`     | PASS             |
| Formatting | `npm run format:check`  | PASS             |
| Linting    | `npm run lint`          | PASS             |
| Tests      | `npm test`              | PASS ([X] tests) |
| Coverage   | `npm run test:coverage` | PASS ([X]%)      |
| Security   | `npm audit`             | PASS             |
| Build      | `npm run build`         | PASS             |

### Database Validation

| Check            | Status |
| ---------------- | ------ |
| Migrations valid | PASS   |
| Prisma client    | PASS   |

### Staging Validation

| Check           | Status |
| --------------- | ------ |
| Health endpoint | PASS   |
| Ready endpoint  | PASS   |
| Smoke tests     | PASS   |

### Production Deployment

| Check           | Status  |
| --------------- | ------- |
| Deploy          | SUCCESS |
| Health endpoint | PASS    |
| Smoke tests     | PASS    |
| Error rate      | Normal  |

### Summary

**Status**: DEPLOYMENT SUCCESSFUL
**Rollback Required**: No
**Issues**: None
```

---

## Release Notes Template

```markdown
## [Version] - [Date]

### Highlights

- [Main feature or change]

### New Features

- [Feature 1]
- [Feature 2]

### Improvements

- [Improvement 1]

### Bug Fixes

- [Fix 1]

### Breaking Changes

- [Breaking change with migration guide]

### Database Migrations

- [Migration description]

### Known Issues

- [Known issue]

### Upgrade Guide

[Steps to upgrade from previous version]
```
