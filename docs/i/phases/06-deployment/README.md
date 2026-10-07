# Phase 6: Deployment

## Overview

The Deployment phase covers the release process, from final validation through production deployment and post-deployment verification. Every step requires validation to ensure correctness.

## Objectives

- Validate all code before deployment
- Safely deploy to production
- Minimize deployment risk
- Ensure monitoring is in place
- Enable quick rollback if needed
- Document release details

---

## Pre-Deployment Validation

**ALL checks must pass before deployment:**

```bash
# Required - ALL MUST PASS
mix compile --warnings-as-errors    # Zero warnings
mix format --check-formatted        # Code formatted
mix test                            # All tests pass
mix test --cover                    # Coverage ≥ 80%
mix credo --strict                  # No credo issues

# Security - MUST PASS
mix sobelow --config                # No security issues
mix hex.audit                       # No vulnerable dependencies

# Type checking - SHOULD PASS
mix dialyzer                        # No type errors

# Release build - MUST PASS
MIX_ENV=prod mix release            # Release builds successfully
```

### Validation Checklist

| Check | Command | Required |
|-------|---------|----------|
| Compiles | `mix compile --warnings-as-errors` | MUST PASS |
| Formatted | `mix format --check-formatted` | MUST PASS |
| Tests | `mix test` | MUST PASS |
| Coverage | `mix test --cover` (≥80%) | MUST PASS |
| Credo | `mix credo --strict` | MUST PASS |
| Security | `mix sobelow` | MUST PASS |
| Dependencies | `mix hex.audit` | MUST PASS |
| Dialyzer | `mix dialyzer` | SHOULD PASS |
| Release | `MIX_ENV=prod mix release` | MUST PASS |

---

## Deployment Strategies

### Blue-Green Deployment
Two identical environments; switch traffic after verification.
- **Pros**: Instant rollback, zero downtime
- **Cons**: Requires double infrastructure

### Canary Deployment
Gradual rollout to small percentage of users.
- **Pros**: Early issue detection, controlled risk
- **Cons**: More complex, longer deployment

### Rolling Deployment
Update instances one at a time.
- **Pros**: No extra infrastructure needed
- **Cons**: Mixed versions during deployment

---

## Process

### Pre-Deployment

1. **Validation** (ALL MUST PASS)
   - Run all validation commands above
   - All tests passing with ≥80% coverage
   - Security audit complete (`mix sobelow`)
   - No vulnerable dependencies (`mix hex.audit`)

2. **Database Validation**
   - Migrations tested (`mix ecto.migrate`)
   - Rollback tested (`mix ecto.rollback`)
   - Backup verified

3. **Release Verification**
   - Release builds successfully (`MIX_ENV=prod mix release`)
   - Release notes finalized
   - CHANGELOG updated
   - Version bumped in `mix.exs`

4. **Preparation**
   - Rollback plan documented
   - Monitoring configured
   - Team notified

### Deployment

1. **Deploy to Staging**
   - Deploy release to staging
   - Run migrations: `./bin/my_app eval "MyApp.Release.migrate"`
   - Verify health endpoint: `curl -f https://staging.example.com/health`
   - Run smoke tests

2. **Staging Validation**
   - Health check passes
   - Ready endpoint shows all services healthy
   - Smoke tests pass
   - No errors in logs

3. **Deploy to Production**
   - Deploy release to production
   - Run migrations
   - Verify health endpoint
   - Run smoke tests

4. **Production Validation**
   - Health check passes
   - Error rates normal
   - Response times within SLA
   - Background jobs running (Oban)

### Post-Deployment

1. **Monitoring**
   - Watch error rates
   - Check performance metrics
   - Verify Oban jobs processing
   - Monitor user feedback

2. **Communication**
   - Announce release
   - Update status page
   - Notify stakeholders

3. **Documentation**
   - Document any issues
   - Update runbooks if needed
   - Record deployment metrics

---

## Checklist

### Pre-Deployment Validation
- [ ] `mix compile --warnings-as-errors` passes
- [ ] `mix format --check-formatted` passes
- [ ] `mix test` passes (all tests)
- [ ] `mix test --cover` ≥ 80%
- [ ] `mix credo --strict` passes
- [ ] `mix sobelow` passes
- [ ] `mix hex.audit` passes
- [ ] `MIX_ENV=prod mix release` builds successfully

### Database
- [ ] Migrations tested (`mix ecto.migrate`)
- [ ] Rollback tested (`mix ecto.rollback`)
- [ ] Backup verified

### Documentation
- [ ] CHANGELOG updated
- [ ] Version bumped in mix.exs
- [ ] Release notes prepared
- [ ] Rollback plan documented

### Staging Deployment
- [ ] Release deployed to staging
- [ ] Migrations run successfully
- [ ] Health endpoint responds
- [ ] Smoke tests pass

### Production Deployment
- [ ] Release deployed to production
- [ ] Migrations run successfully
- [ ] Health endpoint responds
- [ ] Smoke tests pass
- [ ] Error rates normal

### Post-Deployment
- [ ] Monitoring dashboards checked
- [ ] Error rates normal
- [ ] Performance within SLA
- [ ] Oban jobs processing
- [ ] Stakeholders notified
- [ ] Release documented

---

## Templates

- [Release Checklist](./release-checklist.md)
- [Rollback Procedures](./rollback-procedures.md)

---

## Rollback Criteria

Initiate rollback if:
- Error rate > 5% of requests
- P1 bug discovered
- Security vulnerability found
- Performance degradation > 50%
- Data integrity issues

### Rollback Procedure

```bash
# Rollback database migrations
mix ecto.rollback --step 1

# Deploy previous release
./bin/my_app stop
ln -sfn /opt/my_app/releases/previous_version /opt/my_app/current
./bin/my_app start

# Verify rollback
curl -f https://production.example.com/health
```

---

## Validation Report Template

Generate after each deployment:

```markdown
## Deployment Validation Report

**Version**: v[VERSION]
**Date**: YYYY-MM-DD HH:MM UTC
**Environment**: Production
**Status**: SUCCESS / FAILED

### Pre-Deployment Validation
| Check | Status |
|-------|--------|
| mix compile --warnings-as-errors | ✓ PASS |
| mix format --check-formatted | ✓ PASS |
| mix test | ✓ PASS (X tests) |
| mix test --cover | ✓ PASS (X%) |
| mix credo --strict | ✓ PASS |
| mix sobelow | ✓ PASS |
| mix hex.audit | ✓ PASS |
| MIX_ENV=prod mix release | ✓ PASS |

### Deployment Validation
| Check | Status |
|-------|--------|
| Staging health check | ✓ PASS |
| Staging smoke tests | ✓ PASS |
| Production health check | ✓ PASS |
| Production smoke tests | ✓ PASS |

### Post-Deployment Metrics
| Metric | Before | After | Status |
|--------|--------|-------|--------|
| Error Rate | 0.1% | 0.1% | ✓ OK |
| p99 Latency | 180ms | 185ms | ✓ OK |

### Summary
**Deployment**: SUCCESSFUL
**All Validations**: PASSED
```

---

## AI Collaboration Tips

### Effective Prompts

```
"Run full validation before deployment"
```

```
"Create a deployment checklist for releasing v[VERSION]"
```

```
"Generate a rollback procedure for our Phoenix application"
```

```
"Verify staging deployment and run smoke tests"
```

---

## Related Skills

- `deployment` - Deployment guidance and verification
- `validator` - Pre-deployment validation

## Exit Gate

Deployment phase is complete when:
- [ ] All pre-deployment validation passed
- [ ] Staging validated and smoke tests passed
- [ ] Production deployed and validated
- [ ] Post-deployment monitoring confirms healthy state
- [ ] Stakeholders notified
- [ ] Documentation updated
