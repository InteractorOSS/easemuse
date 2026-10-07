# Phase 5: Review

## Overview

The Review phase ensures code quality, security, and performance through systematic review processes before deployment.

## Objectives

- Validate code quality and maintainability
- Identify security vulnerabilities
- Verify performance requirements
- Ensure documentation completeness
- Confirm compliance with standards

---

## Review Types

### Code Review
- Quality and maintainability
- Style guide compliance
- Logic correctness
- Test coverage

### Security Review
- Vulnerability assessment
- Authentication/authorization
- Data protection
- OWASP compliance

### Performance Review
- Response time analysis
- Resource utilization
- Scalability assessment
- Optimization opportunities

### Accessibility Review
- WCAG compliance
- Screen reader compatibility
- Keyboard navigation
- Color contrast

---

## Process

### Code Review Workflow

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────┐    ┌─────────┐            │
│  │ Create  │───►│  Self   │            │
│  │   PR    │    │ Review  │            │
│  └─────────┘    └─────────┘            │
│                      │                  │
│                      ▼                  │
│                ┌─────────┐              │
│                │ Request │              │
│                │ Review  │              │
│                └─────────┘              │
│                      │                  │
│                      ▼                  │
│                ┌─────────┐              │
│           ┌───►│ Review  │◄───┐        │
│           │    └─────────┘    │        │
│           │         │         │        │
│           │         ▼         │        │
│     ┌─────────┐ ┌─────────┐  │        │
│     │ Request │ │ Approve │  │        │
│     │ Changes │ └─────────┘  │        │
│     └─────────┘      │       │        │
│           │          ▼       │        │
│           │    ┌─────────┐   │        │
│           └────│  Merge  │───┘        │
│                └─────────┘            │
│                                         │
└─────────────────────────────────────────┘
```

### Review Checklist

Before requesting review:
- [ ] Self-review completed
- [ ] Tests passing
- [ ] Documentation updated
- [ ] PR description complete

During review:
- [ ] Code quality checked
- [ ] Security assessed
- [ ] Performance considered
- [ ] Tests verified

After review:
- [ ] Feedback addressed
- [ ] Changes approved
- [ ] Ready to merge

---

## Templates

- [Code Review Checklist](./code-review-checklist.md)
- [Security Review](./security-review.md)

---

## AI Collaboration Tips

### Effective Prompts

```
"Review this code for:
1. Security vulnerabilities
2. Performance issues
3. Code style violations
4. Potential bugs

[paste code]"
```

```
"Analyze this PR for:
- Breaking changes
- Missing tests
- Documentation gaps
- Accessibility issues"
```

```
"Check this authentication flow for security issues:
[paste code]"
```

---

## Related Skills

- `code-review` - Comprehensive code review
- `security-audit` - Security analysis
