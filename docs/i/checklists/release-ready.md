# Release Ready Checklist

Final checklist before deploying to production.

---

## Code Quality

### Validation Commands

```bash
npm run typecheck              # TypeScript compiles
npm run format:check           # Code is formatted
npm run lint                   # No lint errors
npm test                       # All tests pass
npm run test:coverage          # Coverage >= 80%
npm audit --audit-level=high   # No vulnerabilities
npm run build                  # Build succeeds
```

| Check | Status |
|-------|--------|
| TypeScript compiles | [ ] |
| Code formatted | [ ] |
| No lint errors | [ ] |
| All tests pass | [ ] |
| Coverage >= 80% | [ ] |
| No security vulnerabilities | [ ] |
| Build succeeds | [ ] |

---

## Database

- [ ] Migrations tested locally
- [ ] Migrations tested on staging
- [ ] Rollback plan documented
- [ ] Backup verified

---

## Documentation

- [ ] CHANGELOG updated
- [ ] Version bumped in package.json
- [ ] API docs updated (if changed)
- [ ] README current

---

## Configuration

- [ ] Environment variables documented
- [ ] Production secrets configured
- [ ] Feature flags set correctly

---

## Testing

- [ ] Manual testing on staging complete
- [ ] Smoke tests passing
- [ ] Performance acceptable
- [ ] No regressions found

---

## Monitoring

- [ ] Health endpoint working
- [ ] Error tracking configured
- [ ] Logs accessible
- [ ] Alerts configured

---

## Communication

- [ ] Team notified of release
- [ ] Stakeholders informed
- [ ] Support team briefed

---

## Final Sign-off

| Role | Name | Date |
|------|------|------|
| Developer | | |
| Reviewer | | |
| QA | | |
| Product Owner | | |

---

## Quick Validation Command

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm audit --audit-level=high && npm run build
```
