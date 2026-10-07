---
name: security-audit
description: Perform OWASP-based security scanning and vulnerability assessment. Use during review phase or when security concerns arise.
---

# Security Audit Skill

OWASP-aligned security scanning for web applications.

## When to Use

- During `/run-review` phase
- Before deployment
- When implementing authentication/authorization
- After security-related changes
- On-demand security assessment

## OWASP Top 10 Checks

### 1. Injection (A03:2021)

**Check for:**
- SQL injection (ensure Prisma parameterized queries)
- NoSQL injection
- Command injection
- LDAP injection

```typescript
// BAD - SQL injection risk
const query = `SELECT * FROM users WHERE email = '${email}'`;

// GOOD - Prisma handles parameterization
const user = await prisma.user.findUnique({ where: { email } });
```

### 2. Broken Authentication (A07:2021)

**Check for:**
- Weak password policies
- Missing rate limiting on login
- Session fixation
- Insecure token storage

```typescript
// Verify password strength
const PASSWORD_MIN_LENGTH = 12;

// Verify session regeneration after login
req.session.regenerate((err) => {
  req.session.userId = user.id;
});

// Verify secure cookie settings
cookie: {
  secure: true,
  httpOnly: true,
  sameSite: 'strict'
}
```

### 3. Sensitive Data Exposure (A02:2021)

**Check for:**
- Sensitive data in logs
- Unencrypted data at rest
- Missing HTTPS
- Exposed credentials

```typescript
// BAD - logging sensitive data
console.log('User login:', { email, password });

// GOOD - redact sensitive fields
console.log('User login:', { email, passwordProvided: !!password });
```

### 4. XML External Entities (A05:2021)

**Check for:**
- XML parser configuration
- XXE vulnerabilities

### 5. Broken Access Control (A01:2021)

**Check for:**
- Missing authorization checks
- IDOR vulnerabilities
- Privilege escalation

```typescript
// BAD - no ownership check
const document = await prisma.document.findUnique({ where: { id } });

// GOOD - verify ownership
const document = await prisma.document.findFirst({
  where: {
    id,
    OR: [
      { ownerId: userId },
      { sharedWith: { some: { userId } } }
    ]
  }
});
if (!document) throw new ForbiddenError();
```

### 6. Security Misconfiguration (A05:2021)

**Check for:**
- Default credentials
- Unnecessary features enabled
- Missing security headers
- Verbose error messages

```typescript
// Required security headers
app.use(helmet());

// Error handling - don't leak details
if (process.env.NODE_ENV === 'production') {
  res.status(500).json({ error: 'Internal server error' });
}
```

### 7. Cross-Site Scripting (A03:2021)

**Check for:**
- Reflected XSS
- Stored XSS
- DOM-based XSS

```typescript
// React auto-escapes by default, but watch for:
// BAD - dangerouslySetInnerHTML with user input
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// GOOD - sanitize if HTML needed
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

### 8. Insecure Deserialization (A08:2021)

**Check for:**
- Untrusted data deserialization
- Object injection

### 9. Using Components with Known Vulnerabilities (A06:2021)

**Check for:**
- Outdated dependencies
- Known CVEs

```bash
# Run npm audit
npm audit

# Fix vulnerabilities
npm audit fix
```

### 10. Insufficient Logging & Monitoring (A09:2021)

**Check for:**
- Security event logging
- Audit trails
- Monitoring alerts

## Security Checklist

```markdown
## Security Audit Checklist

### Authentication
- [ ] Strong password policy enforced
- [ ] Rate limiting on auth endpoints
- [ ] Session management secure
- [ ] JWT properly configured (RS256, short expiry)
- [ ] Password hashing (bcrypt, argon2)

### Authorization
- [ ] All endpoints require auth where needed
- [ ] Resource-level authorization checks
- [ ] No privilege escalation possible
- [ ] Role-based access properly implemented

### Input Validation
- [ ] All inputs validated (Zod schemas)
- [ ] File uploads restricted
- [ ] Content-type validated
- [ ] Size limits enforced

### Output Encoding
- [ ] XSS prevention (React escaping)
- [ ] Content-Security-Policy headers
- [ ] Safe HTML rendering

### Data Protection
- [ ] HTTPS enforced
- [ ] Sensitive data encrypted
- [ ] No secrets in code/logs
- [ ] PII handled properly

### Security Headers
- [ ] X-Frame-Options
- [ ] X-Content-Type-Options
- [ ] X-XSS-Protection
- [ ] Content-Security-Policy
- [ ] Strict-Transport-Security

### Dependencies
- [ ] npm audit clean
- [ ] No known vulnerabilities
- [ ] Lock file committed
- [ ] Regular updates scheduled

### Logging
- [ ] Auth events logged
- [ ] Sensitive data redacted
- [ ] Log rotation configured
- [ ] Monitoring in place
```

## Output Format

```markdown
## Security Audit Report

**Date**: [Date]
**Scope**: [Files/Features reviewed]
**Auditor**: Claude AI

### Summary
- **Risk Level**: [HIGH | MEDIUM | LOW | MINIMAL]
- **Critical Issues**: [count]
- **High Issues**: [count]
- **Medium Issues**: [count]
- **Low Issues**: [count]

### Critical Issues (P0)

#### Issue 1: [Title]
**OWASP Category**: [Category]
**Location**: `src/routes/auth.ts:45`
**Description**: [What the issue is]
**Impact**: [Potential damage]
**Remediation**: [How to fix]

### High Issues (P1)
[Similar format]

### Medium Issues (P2)
[Similar format]

### Low Issues (P3)
[Similar format]

### OWASP Coverage
| Category | Status |
|----------|--------|
| A01 Broken Access Control | PASS |
| A02 Cryptographic Failures | PASS |
| A03 Injection | PASS |
| ... | ... |

### Recommendations
1. [Priority recommendation]
2. [Next recommendation]

### Dependencies
- npm audit: [PASS/FAIL - count vulnerabilities]
- Last audit: [date]
```
