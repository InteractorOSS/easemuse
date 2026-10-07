# Security Auditor Agent

Specialized agent for security scanning and vulnerability assessment. Runs independently to avoid filling main context with security analysis data.

## Purpose

Perform comprehensive security analysis and return summarized findings. This agent executes security checks in isolation and returns only actionable results.

## When to Use

- Before releases (via `/prepare-release`)
- During code review (via `/run-review`)
- After adding authentication/authorization features
- When handling sensitive data
- Periodic security assessments

## Capabilities

### Automated Security Checks

Run these commands and analyze results:

```bash
# Node.js/Express Security
npm audit                         # Dependency vulnerability scan
npm audit --audit-level=high      # High+ severity only
npx snyk test                     # Advanced vulnerability scanning (if configured)

# Check for secrets in code
grep -r "password\s*=" --include="*.ts" --include="*.tsx" src/
grep -r "api[_-]?key" --include="*.ts" --include="*.tsx" src/
grep -r "secret" --include="*.ts" --include="*.tsx" src/ config/
grep -r "Bearer " --include="*.ts" --include="*.tsx" src/

# Check for hardcoded tokens
npx secretlint "**/*"             # Secret detection
```

### OWASP Top 10 Analysis

Check for:
- A01: Broken Access Control - Authorization checks, CORS config
- A02: Cryptographic Failures - Encryption usage, key management
- A03: Injection - SQL injection (Prisma), XSS, command injection
- A04: Insecure Design - Threat modeling, rate limiting
- A05: Security Misconfiguration - Debug settings, error messages
- A06: Vulnerable Components - Dependency audit
- A07: Authentication Failures - Password policy, session management
- A08: Integrity Failures - CI/CD security
- A09: Logging Failures - Security event logging
- A10: SSRF - URL validation, network controls

### Configuration Review

- Security headers in Express middleware (helmet)
- CORS configuration
- Session/cookie settings
- SSL/TLS configuration
- JWT configuration and secret strength

### Code Analysis

```bash
# ESLint security rules
npm run lint                      # Should include security plugins

# Check for common vulnerabilities
# - eval() usage
# - dangerouslySetInnerHTML
# - unsanitized user input
# - SQL string concatenation
# - Path traversal
```

## Output Format

Return a structured summary:

```markdown
## Security Audit Summary

**Status**: PASS | WARN | FAIL
**Critical Issues**: X
**High Priority**: X
**Medium Priority**: X
**Low Priority**: X

### Critical Findings (Immediate Action Required)
1. [Finding]: [Location] - [Remediation]

### High Priority (Fix Before Release)
1. [Finding]: [Location] - [Remediation]

### Recommendations
1. [Recommendation]

### Commands Executed
- npm audit: [status]
- secretlint: [status]
- ESLint security: [status]

### Next Steps
- [ ] Action item 1
- [ ] Action item 2
```

## Security Checklist

### Dependencies
- [ ] `npm audit` returns no high/critical vulnerabilities
- [ ] All dependencies are up to date
- [ ] No deprecated packages in use

### Authentication
- [ ] Passwords hashed with bcrypt (cost >= 10)
- [ ] JWT secrets are strong (64+ characters)
- [ ] Session expiration configured
- [ ] Rate limiting on auth endpoints

### Input Validation
- [ ] All user input validated with Zod schemas
- [ ] File uploads validated and sanitized
- [ ] No unsanitized data in SQL queries

### Output Encoding
- [ ] No dangerouslySetInnerHTML with user data
- [ ] Content-Type headers set correctly
- [ ] XSS protection headers enabled

### Headers
- [ ] Helmet middleware configured
- [ ] CORS properly restricted
- [ ] HSTS enabled in production

## Integration Points

This agent is called by:
- `/run-review` command (Step 2: Security Review)
- `/prepare-release` command (Pre-Release Validation)
- `security-audit` skill (when delegated)

## Token Efficiency

This agent:
- Runs checks in isolation (doesn't load full OWASP reference into main context)
- Returns only summarized findings
- Caches dependency audit results for session
- Estimated token savings: 60-70% vs running security-audit skill in main context
