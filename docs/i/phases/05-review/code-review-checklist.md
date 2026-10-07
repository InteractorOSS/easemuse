# Code Review Checklist

## Quick Reference

Use this checklist when reviewing pull requests.

---

## General

- [ ] PR has clear description
- [ ] Changes match PR description
- [ ] Appropriate size (< 400 lines ideal)
- [ ] No unrelated changes included

---

## Code Quality

### Readability
- [ ] Code is easy to understand
- [ ] Variable/function names are descriptive
- [ ] No unnecessary complexity
- [ ] Comments explain "why" not "what"

### Structure
- [ ] Functions are small and focused
- [ ] Single responsibility principle followed
- [ ] No deeply nested code (max 3 levels)
- [ ] Code is DRY (Don't Repeat Yourself)

### Style
- [ ] Follows project style guide
- [ ] Consistent formatting
- [ ] No linting errors
- [ ] Proper use of whitespace

---

## Logic

### Correctness
- [ ] Logic is correct
- [ ] Edge cases handled
- [ ] Error conditions handled
- [ ] No off-by-one errors

### Error Handling
- [ ] Errors caught appropriately
- [ ] Meaningful error messages
- [ ] Errors logged with context
- [ ] No silent failures

### Data Handling
- [ ] Input validated
- [ ] Output sanitized
- [ ] Null/undefined handled
- [ ] Types are correct

---

## Security

### Authentication/Authorization
- [ ] Auth checks present where needed
- [ ] No hardcoded credentials
- [ ] Sensitive data protected

### Input Validation
- [ ] User input validated
- [ ] SQL injection prevented
- [ ] XSS prevented
- [ ] Path traversal prevented

### Data Protection
- [ ] Sensitive data not logged
- [ ] Proper encryption used
- [ ] Secure transmission (HTTPS)

---

## Testing

### Coverage
- [ ] Tests exist for new code
- [ ] Edge cases tested
- [ ] Error paths tested
- [ ] Integration tests where needed

### Quality
- [ ] Tests are meaningful
- [ ] Tests are readable
- [ ] Tests are maintainable
- [ ] No flaky tests

---

## Performance

### Efficiency
- [ ] No obvious performance issues
- [ ] No N+1 queries
- [ ] Appropriate data structures used
- [ ] Caching considered

### Resources
- [ ] No memory leaks
- [ ] Resources properly cleaned up
- [ ] Connections pooled/reused
- [ ] Async operations where appropriate

---

## Documentation

### Code Documentation
- [ ] Public APIs documented
- [ ] Complex logic explained
- [ ] TODO/FIXME comments addressed

### External Documentation
- [ ] README updated if needed
- [ ] API docs updated
- [ ] CHANGELOG entry added

---

## Review Feedback Format

### Blocking Issues
```markdown
🔴 **[Required]**: [Description of issue]

[Explanation and suggested fix]
```

### Suggestions
```markdown
🟡 **[Suggestion]**: [Description]

[Explanation and benefits]
```

### Minor Notes
```markdown
🟢 **[Nit]**: [Minor issue]
```

### Questions
```markdown
❓ **[Question]**: [Your question]
```

### Praise
```markdown
👍 **[Nice]**: [What's good about this code]
```

---

## Common Issues to Watch For

### Security
- Hardcoded secrets
- Missing input validation
- Improper error exposure
- Insufficient authorization

### Performance
- N+1 queries
- Unnecessary database calls
- Missing pagination
- Synchronous blocking operations

### Maintainability
- Magic numbers/strings
- Duplicated code
- Overly complex functions
- Poor naming

### Bugs
- Off-by-one errors
- Null pointer exceptions
- Race conditions
- Resource leaks

---

## Approving PRs

Approve when:
- [ ] All critical issues addressed
- [ ] Code meets quality standards
- [ ] Tests are adequate
- [ ] No security concerns
- [ ] Documentation complete

Request changes when:
- [ ] Critical bugs found
- [ ] Security vulnerabilities present
- [ ] Tests missing or inadequate
- [ ] Code quality issues

Comment without approval when:
- [ ] Minor suggestions only
- [ ] Questions need answers
- [ ] Need more context
