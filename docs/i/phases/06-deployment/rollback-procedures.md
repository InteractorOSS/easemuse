# Rollback Procedures

## Overview

This document outlines procedures for rolling back deployments when issues are detected in production.

---

## Rollback Decision Matrix

| Severity | Response Time | Approval Needed | Rollback? |
|----------|---------------|-----------------|-----------|
| Critical | Immediate | None (post-mortem) | Yes |
| High | < 15 min | On-call lead | Usually |
| Medium | < 1 hour | Team lead | Evaluate |
| Low | < 24 hours | None | Probably not |

---

## Rollback Triggers

### Immediate Rollback (No Approval Needed)
- Application crash or unavailability
- Data corruption detected
- Security breach discovered
- Error rate > 10%
- P0 bug affecting all users

### Conditional Rollback (Requires Evaluation)
- Error rate 1-10%
- Performance degradation > 50%
- High-severity bug affecting subset of users
- Unexpected behavior in critical features

### Monitor and Fix (No Rollback)
- Minor bugs with workarounds
- Performance degradation < 20%
- Cosmetic issues
- Low-traffic edge cases

---

## Rollback Procedures

### Application Rollback

#### Kubernetes Deployment
```bash
# Check current deployment
kubectl get deployment [name] -n [namespace]

# View rollout history
kubectl rollout history deployment/[name] -n [namespace]

# Rollback to previous version
kubectl rollout undo deployment/[name] -n [namespace]

# Rollback to specific revision
kubectl rollout undo deployment/[name] -n [namespace] --to-revision=[number]

# Verify rollback
kubectl rollout status deployment/[name] -n [namespace]
```

#### Docker Compose
```bash
# Stop current containers
docker-compose down

# Pull previous image version
docker pull [image]:[previous-tag]

# Update docker-compose.yml or use specific tag
docker-compose up -d

# Verify
docker-compose ps
docker-compose logs -f
```

#### Traditional Deployment (PM2/systemd)
```bash
# PM2
pm2 stop [app-name]
cd /path/to/app
git checkout [previous-tag]
npm ci
pm2 start [app-name]

# Systemd
sudo systemctl stop [service]
cd /path/to/app
git checkout [previous-tag]
npm ci
sudo systemctl start [service]
```

---

### Database Rollback

#### Before Running Migrations
```sql
-- Always create a backup point before migrations
BEGIN;

-- Your migration
ALTER TABLE users ADD COLUMN new_field VARCHAR(255);

-- If testing in transaction
ROLLBACK;
-- or if confirmed
COMMIT;
```

#### Rolling Back Migrations

```bash
# Using Prisma
npx prisma migrate resolve --rolled-back [migration-name]

# Using Knex
npx knex migrate:rollback

# Using Rails
rails db:rollback STEP=1

# Using Django
python manage.py migrate [app] [previous-migration]
```

#### Data Recovery
```bash
# Restore from backup (PostgreSQL)
pg_restore -h [host] -U [user] -d [database] [backup-file]

# Point-in-time recovery
pg_restore --target-time="2024-01-15 10:30:00" ...
```

---

### Infrastructure Rollback

#### Blue-Green Switch
```bash
# Assuming using load balancer
# Switch traffic back to blue (previous) environment

# AWS ALB
aws elbv2 modify-listener \
  --listener-arn [arn] \
  --default-actions Type=forward,TargetGroupArn=[blue-target-group-arn]

# Nginx (manual)
# Edit nginx config to point to previous upstream
sudo nginx -t
sudo systemctl reload nginx
```

#### Canary Rollback
```bash
# Set canary traffic to 0%
# Route 100% to stable version

# Istio example
kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: [service]
spec:
  hosts:
  - [service]
  http:
  - route:
    - destination:
        host: [service]
        subset: stable
      weight: 100
    - destination:
        host: [service]
        subset: canary
      weight: 0
EOF
```

---

## Rollback Verification

### Immediate Checks
- [ ] Application is accessible
- [ ] Login functionality works
- [ ] Health endpoints returning 200
- [ ] Error rate decreasing

### Smoke Tests
- [ ] Critical user flows work
- [ ] API endpoints responding
- [ ] Database queries succeeding
- [ ] External integrations working

### Monitoring Checks
- [ ] Error rate < baseline
- [ ] Response times normal
- [ ] No new error types
- [ ] Resource utilization normal

---

## Communication During Rollback

### Internal Communication

```
🔴 ROLLBACK IN PROGRESS

Version: [version]
Reason: [brief reason]
Started: [time]
Expected completion: [time]

Status updates will follow.

Point of contact: [name]
```

### Status Page Update

```
[Investigating/Identified/Monitoring/Resolved]

We are currently experiencing issues with [service].
We have identified the issue and are rolling back to
the previous version.

Impact: [description of impact]
Started: [time]
Expected resolution: [time]

Updates will be posted as they become available.
```

---

## Post-Rollback Actions

### Immediate (0-1 hour)
1. [ ] Verify rollback successful
2. [ ] Monitor error rates
3. [ ] Update status page
4. [ ] Notify stakeholders

### Short-term (1-24 hours)
1. [ ] Investigate root cause
2. [ ] Document timeline of events
3. [ ] Identify what went wrong
4. [ ] Plan fix

### Follow-up (1-7 days)
1. [ ] Complete post-mortem
2. [ ] Implement fixes
3. [ ] Update runbooks
4. [ ] Add tests/monitoring

---

## Post-Mortem Template

```markdown
# Incident Post-Mortem

**Date**: [Date]
**Duration**: [X hours/minutes]
**Severity**: [Critical/High/Medium]

## Summary
[One paragraph summary of what happened]

## Timeline
- [HH:MM] - Deployment started
- [HH:MM] - Issue detected
- [HH:MM] - Rollback initiated
- [HH:MM] - Rollback complete
- [HH:MM] - Service restored

## Root Cause
[What caused the issue]

## Impact
- Users affected: [number]
- Duration: [time]
- Revenue impact: [if applicable]

## What Went Well
- [Positive 1]
- [Positive 2]

## What Went Wrong
- [Issue 1]
- [Issue 2]

## Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| [Action 1] | [Name] | [Date] |
| [Action 2] | [Name] | [Date] |

## Lessons Learned
[Key takeaways]
```

---

## Emergency Contacts

| Role | Name | Phone | Escalation Order |
|------|------|-------|------------------|
| On-call Engineer | [Name] | [Phone] | 1 |
| Engineering Lead | [Name] | [Phone] | 2 |
| DevOps Lead | [Name] | [Phone] | 3 |
| CTO | [Name] | [Phone] | 4 |
