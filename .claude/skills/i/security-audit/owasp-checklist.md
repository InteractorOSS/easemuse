# OWASP Security Checklist

Quick reference for OWASP Top 10 (2021) security checks.

## A01:2021 - Broken Access Control

- [ ] All routes require appropriate authentication
- [ ] Authorization verified for each resource access
- [ ] No IDOR (Insecure Direct Object Reference)
- [ ] Directory listing disabled
- [ ] JWT claims validated
- [ ] CORS properly configured

## A02:2021 - Cryptographic Failures

- [ ] HTTPS enforced (HSTS header)
- [ ] Strong password hashing (bcrypt/argon2)
- [ ] Sensitive data encrypted at rest
- [ ] No sensitive data in URLs
- [ ] Secure random number generation
- [ ] Strong encryption algorithms only

## A03:2021 - Injection

- [ ] Parameterized queries (Prisma)
- [ ] Input validation (Zod)
- [ ] Output encoding
- [ ] No dynamic code execution
- [ ] Shell command escaping
- [ ] LDAP query sanitization

## A04:2021 - Insecure Design

- [ ] Threat modeling performed
- [ ] Security requirements defined
- [ ] Secure design patterns used
- [ ] Rate limiting implemented
- [ ] Defense in depth

## A05:2021 - Security Misconfiguration

- [ ] Security headers configured (helmet)
- [ ] Default accounts disabled
- [ ] Error handling doesn't leak info
- [ ] Unnecessary features disabled
- [ ] Server hardened
- [ ] Cloud permissions minimal

## A06:2021 - Vulnerable Components

- [ ] npm audit clean
- [ ] Dependencies up to date
- [ ] No deprecated packages
- [ ] Security advisories monitored
- [ ] SCA (Software Composition Analysis)

## A07:2021 - Authentication Failures

- [ ] Multi-factor authentication available
- [ ] Strong password policy
- [ ] Rate limiting on login
- [ ] Session timeout
- [ ] Secure session management
- [ ] No credential stuffing possible

## A08:2021 - Software and Data Integrity

- [ ] CI/CD pipeline secured
- [ ] Package integrity verified
- [ ] No unsigned/untrusted code
- [ ] Subresource integrity for CDN

## A09:2021 - Security Logging Failures

- [ ] Authentication events logged
- [ ] Authorization failures logged
- [ ] Input validation failures logged
- [ ] High-value transactions logged
- [ ] Logs protected from tampering
- [ ] Monitoring and alerting active

## A10:2021 - Server-Side Request Forgery

- [ ] URL validation for external requests
- [ ] No internal network access
- [ ] Allowlist for external services
- [ ] Response handling secure

## Quick Validation Commands

```bash
# Check dependencies
npm audit

# Check for secrets in code
npx secretlint "**/*"

# Check security headers (requires running server)
curl -I https://localhost:3000 | grep -E "X-|Content-Security|Strict"
```
