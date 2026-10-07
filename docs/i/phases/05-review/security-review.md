# Security Review Checklist

## Overview

This checklist guides security reviews for code changes, with focus on OWASP Top 10 vulnerabilities.

---

## Quick Assessment

### Critical Checks
- [ ] No hardcoded secrets/credentials
- [ ] Input validation on all user input
- [ ] Authentication on protected endpoints
- [ ] Authorization checks before actions
- [ ] Parameterized database queries
- [ ] Output encoding for user content

---

## OWASP Top 10 Review

### A01: Broken Access Control
- [ ] Access controls enforced server-side
- [ ] Default deny for protected resources
- [ ] CORS properly configured
- [ ] Directory listing disabled
- [ ] No IDOR vulnerabilities
- [ ] Rate limiting implemented

### A02: Cryptographic Failures
- [ ] Sensitive data encrypted at rest
- [ ] TLS for data in transit
- [ ] Strong algorithms used (no MD5, SHA1)
- [ ] Proper key management
- [ ] No sensitive data in URLs

### A03: Injection
- [ ] Parameterized queries/prepared statements
- [ ] Input validation (whitelist preferred)
- [ ] Output encoding
- [ ] No dynamic code execution (eval, etc.)
- [ ] No command injection risks

### A04: Insecure Design
- [ ] Threat modeling considered
- [ ] Security requirements defined
- [ ] Secure design patterns used
- [ ] Business logic validated

### A05: Security Misconfiguration
- [ ] Default credentials changed
- [ ] Unnecessary features disabled
- [ ] Error messages don't leak info
- [ ] Security headers configured
- [ ] Proper file permissions

### A06: Vulnerable Components
- [ ] Dependencies up to date
- [ ] No known vulnerabilities (npm audit)
- [ ] Components from trusted sources

### A07: Authentication Failures
- [ ] Strong password policy
- [ ] MFA available/required
- [ ] Session management secure
- [ ] Brute force protection
- [ ] Secure password storage (bcrypt)

### A08: Integrity Failures
- [ ] Dependencies verified (lockfile)
- [ ] No unsigned code/resources
- [ ] CI/CD pipeline secured

### A09: Logging Failures
- [ ] Security events logged
- [ ] No sensitive data in logs
- [ ] Log integrity protected
- [ ] Alerting configured

### A10: SSRF
- [ ] URL validation for remote requests
- [ ] Allowlist for external resources
- [ ] No internal network exposure

---

## Code-Level Security Checks

### Authentication
```
- [ ] Passwords hashed with bcrypt/argon2
- [ ] Tokens have appropriate expiration
- [ ] Session IDs regenerated on login
- [ ] Logout invalidates session
```

### Authorization
```
- [ ] Every endpoint has auth check
- [ ] Role/permission checks present
- [ ] Resource ownership verified
- [ ] Admin functions protected
```

### Input Handling
```
- [ ] All inputs validated
- [ ] Validation server-side
- [ ] Strict type checking
- [ ] Length limits enforced
- [ ] File upload validation (type, size)
```

### Output Handling
```
- [ ] HTML encoding for user content
- [ ] JSON responses properly typed
- [ ] Headers prevent MIME sniffing
- [ ] CSP configured
```

### Data Protection
```
- [ ] PII properly handled
- [ ] Encryption for sensitive data
- [ ] Secure deletion implemented
- [ ] No data leakage in errors
```

---

## Security Headers

Verify these headers are set:

```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=()
```

---

## Common Vulnerabilities

### SQL Injection
```javascript
// BAD
db.query(`SELECT * FROM users WHERE id = '${userId}'`);

// GOOD
db.query('SELECT * FROM users WHERE id = ?', [userId]);
```

### XSS
```javascript
// BAD
element.innerHTML = userInput;

// GOOD
element.textContent = userInput;
// or use DOMPurify
element.innerHTML = DOMPurify.sanitize(userInput);
```

### Command Injection
```javascript
// BAD
exec(`ls ${userInput}`);

// GOOD
execFile('ls', [validatedInput]);
```

### Path Traversal
```javascript
// BAD
const file = path.join(baseDir, userInput);

// GOOD
const file = path.join(baseDir, path.basename(userInput));
if (!file.startsWith(baseDir)) throw new Error('Invalid path');
```

---

## Secrets Check

Ensure these are NOT in code:
- [ ] API keys
- [ ] Database passwords
- [ ] Private keys
- [ ] OAuth secrets
- [ ] Encryption keys
- [ ] AWS credentials

Check these files:
- `.env` (should be gitignored)
- Configuration files
- Test files
- Comments

---

## Security Review Summary

```markdown
## Security Review

**Reviewer**: [Name]
**Date**: [Date]
**PR/Code**: [Reference]

### Summary
- [ ] Passed - No security issues found
- [ ] Passed with notes - Minor issues, acceptable
- [ ] Failed - Security issues must be addressed

### Findings

#### Critical
[List critical findings]

#### High
[List high findings]

#### Medium
[List medium findings]

#### Low
[List low findings]

### Recommendations
[List recommendations]

### Sign-off
- [ ] Security review complete
- [ ] Issues addressed (if any)
```

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
