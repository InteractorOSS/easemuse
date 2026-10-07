# Code Complete Checklist

Use this checklist before declaring a feature or sprint "code complete."

---

## Functionality

### Features
- [ ] All acceptance criteria met
- [ ] Feature works as specified
- [ ] Edge cases handled
- [ ] Error scenarios handled
- [ ] User feedback provided (loading states, success/error messages)

### Integration
- [ ] Integrates correctly with existing code
- [ ] No regressions introduced
- [ ] API contracts followed
- [ ] Database migrations work

---

## Code Quality

### Standards
- [ ] Code follows style guide
- [ ] No linting errors
- [ ] No type errors
- [ ] Consistent naming conventions
- [ ] No commented-out code

### Structure
- [ ] Functions are small and focused
- [ ] No code duplication
- [ ] Clear separation of concerns
- [ ] Appropriate abstraction level

### Readability
- [ ] Code is self-documenting
- [ ] Complex logic has comments
- [ ] No magic numbers/strings
- [ ] Clear control flow

---

## Testing

### Unit Tests
- [ ] Unit tests written for new code
- [ ] Tests cover happy path
- [ ] Tests cover edge cases
- [ ] Tests cover error conditions
- [ ] All unit tests passing

### Integration Tests
- [ ] Integration tests for APIs
- [ ] Integration tests for database operations
- [ ] Integration tests for external services (mocked)
- [ ] All integration tests passing

### Coverage
- [ ] Overall coverage ≥ 80%
- [ ] New code coverage ≥ 80%
- [ ] Critical paths at 100%
- [ ] No untested critical code

---

## Security

### Code Security
- [ ] No hardcoded secrets
- [ ] Input validation implemented
- [ ] Output encoding applied
- [ ] Parameterized queries used
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities

### Authentication & Authorization
- [ ] Auth checks on protected endpoints
- [ ] Permission checks for actions
- [ ] Session management secure

### Data Protection
- [ ] Sensitive data encrypted
- [ ] No sensitive data in logs
- [ ] PII handled correctly

---

## Performance

### Efficiency
- [ ] No obvious performance issues
- [ ] Database queries optimized
- [ ] No N+1 queries
- [ ] Appropriate indexes exist

### Resources
- [ ] No memory leaks
- [ ] Resources properly released
- [ ] Async operations where appropriate
- [ ] Caching implemented where beneficial

---

## Error Handling

### Implementation
- [ ] All errors caught appropriately
- [ ] Meaningful error messages
- [ ] Errors logged with context
- [ ] No silent failures

### User Experience
- [ ] User-friendly error messages
- [ ] Graceful degradation
- [ ] Recovery options provided

---

## Documentation

### Code Documentation
- [ ] Public APIs documented (JSDoc/docstrings)
- [ ] Complex logic explained
- [ ] Type definitions complete

### External Documentation
- [ ] README updated (if needed)
- [ ] API documentation updated
- [ ] CHANGELOG entry added
- [ ] Configuration documented

---

## Code Review

### Pre-Review
- [ ] Self-review completed
- [ ] PR description is clear
- [ ] Related issues linked
- [ ] Screenshots included (for UI changes)

### Review Process
- [ ] Code reviewed by peer
- [ ] All comments addressed
- [ ] Approval obtained

---

## Build & Deploy

### Build
- [ ] Build succeeds locally
- [ ] Build succeeds in CI
- [ ] No build warnings
- [ ] Bundle size acceptable

### Deployment
- [ ] Deployment scripts work
- [ ] Environment variables documented
- [ ] Migrations tested
- [ ] Rollback plan exists

---

## Accessibility (for UI)

- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Sufficient color contrast
- [ ] ARIA labels where needed
- [ ] Focus states visible

---

## Cross-Browser/Platform (if applicable)

- [ ] Tested in Chrome
- [ ] Tested in Firefox
- [ ] Tested in Safari
- [ ] Tested on mobile
- [ ] Responsive design works

---

## Final Checks

- [ ] Feature demo ready
- [ ] Known issues documented
- [ ] Technical debt documented
- [ ] Ready for QA/testing phase

---

## Sign-off

| Check | Developer | Date |
|-------|-----------|------|
| Code Complete | | |
| Tests Passing | | |
| Documentation Updated | | |
| Ready for Review | | |
