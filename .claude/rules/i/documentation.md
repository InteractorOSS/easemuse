# Documentation Rules

Standards for maintaining clear, useful documentation.

## Principles

1. **Keep it current** - Update docs with code changes
2. **Be concise** - Avoid unnecessary verbosity
3. **Use examples** - Show, don't just tell
4. **Document the "why"** - Not just the "what"
5. **Target the audience** - Different docs for different readers

---

## Code Documentation

### When to Comment

**Do comment:**
- Complex algorithms or business logic
- Non-obvious decisions or workarounds
- Public APIs and interfaces
- Security-sensitive code
- Performance-critical sections

**Don't comment:**
- Self-explanatory code
- What the code does (should be obvious)
- Obvious variable assignments
- Every function (use good naming instead)

### Comment Examples

```javascript
// Good - explains WHY, not what
// Using exponential backoff because the payment API rate-limits
// requests and returns 429 during peak hours
await retryWithBackoff(processPayment, { maxAttempts: 3 });

// Good - documents a workaround
// Safari doesn't support the standard API, fallback required
// See: https://bugs.webkit.org/show_bug.cgi?id=12345
const storage = window.localStorage ?? createFallbackStorage();

// Good - security note
// IMPORTANT: This must run after authentication middleware
// to ensure user context is available
const userId = req.user.id;

// Bad - states the obvious
// Increment counter by 1
counter++;

// Bad - outdated comment
// Calculate total with 5% tax
const total = subtotal * 1.08;  // Actually 8% now!
```

### JSDoc/TSDoc Standards

```typescript
/**
 * Creates a new user account.
 *
 * Validates the input, hashes the password, stores the user in the database,
 * and sends a welcome email.
 *
 * @param options - User creation options
 * @param options.email - Valid email address (required)
 * @param options.name - Display name (required, 2-100 chars)
 * @param options.role - User role (optional, defaults to 'user')
 * @returns The created user object (without password)
 * @throws {ValidationError} If email format is invalid
 * @throws {ConflictError} If email already exists
 *
 * @example
 * ```typescript
 * const user = await createUser({
 *   email: 'john@example.com',
 *   name: 'John Doe',
 * });
 * console.log(user.id); // 'usr_abc123'
 * ```
 */
async function createUser(options: CreateUserOptions): Promise<User> {
  // Implementation
}
```

### Python Docstrings

```python
def create_user(email: str, name: str, role: str = "user") -> User:
    """Create a new user account.

    Validates input, hashes password, and stores user in database.

    Args:
        email: Valid email address.
        name: Display name (2-100 characters).
        role: User role. Defaults to "user".

    Returns:
        User: The created user object without password.

    Raises:
        ValidationError: If email format is invalid.
        ConflictError: If email already exists.

    Example:
        >>> user = create_user("john@example.com", "John Doe")
        >>> print(user.id)
        'usr_abc123'
    """
    pass
```

---

## README Structure

Every project should have a README with these sections:

```markdown
# Project Name

Brief description of what this project does.

## Features

- Key feature 1
- Key feature 2

## Prerequisites

- Node.js >= 18
- npm >= 9
- PostgreSQL 15+

## Installation

\`\`\`bash
git clone <repo-url>
cd project-name
npm install
cp .env.example .env
# Configure .env with your values
npm run dev
\`\`\`

## Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `PORT` | Server port | No | 3000 |

## Usage

\`\`\`bash
npm run dev      # Development server
npm run build    # Production build
npm test         # Run tests
\`\`\`

## API Documentation

Link to API docs or brief overview.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[License type]
```

---

## API Documentation

### Endpoint Documentation Template

```markdown
## Create User

Creates a new user account.

**Endpoint**: `POST /api/v1/users`

**Authentication**: Required (Bearer token)

**Permissions**: `users:create`

### Request

**Headers**:
| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |
| `Content-Type` | `application/json` | Yes |

**Body**:
\`\`\`json
{
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user"
}
\`\`\`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Valid email address |
| `name` | string | Yes | 2-100 characters |
| `role` | string | No | "user" or "admin", defaults to "user" |

### Response

**Success (201 Created)**:
\`\`\`json
{
  "id": "usr_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user",
  "createdAt": "2024-01-15T10:30:00Z"
}
\`\`\`

**Error (400 Bad Request)**:
\`\`\`json
{
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
\`\`\`

**Error (409 Conflict)**:
\`\`\`json
{
  "error": "Email already exists"
}
\`\`\`

### Example

\`\`\`bash
curl -X POST "https://api.example.com/api/v1/users" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "name": "John Doe"}'
\`\`\`
```

---

## Changelog Format

Follow [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- New user profile endpoint

### Changed
- Improved error messages for validation

## [1.2.0] - 2024-01-15

### Added
- User avatar upload feature (#123)
- Email verification flow (#124)

### Changed
- Updated password requirements per NIST guidelines
- Improved login page performance

### Fixed
- Fixed race condition in session handling (#125)

### Security
- Updated dependencies to patch CVE-2024-1234

## [1.1.0] - 2024-01-01

### Added
- Initial release
```

### Change Types
- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Now removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

---

## Architecture Decision Records (ADRs)

Document significant decisions:

```markdown
# ADR-001: Use PostgreSQL for Primary Database

## Status
Accepted

## Context
We need to choose a database for storing user data, orders, and products.

## Decision
We will use PostgreSQL as our primary database.

## Rationale
- ACID compliance for transaction integrity
- Strong JSON support for flexible schemas
- Excellent performance for read-heavy workloads
- Rich ecosystem and tooling
- Team expertise

## Alternatives Considered
- **MySQL**: Less JSON support, licensing concerns
- **MongoDB**: Eventual consistency not suitable for financial data
- **CockroachDB**: Overkill for current scale

## Consequences
- Need PostgreSQL expertise for operations
- Must manage connection pooling carefully
- Schema migrations required for changes
```

---

## Inline Documentation Tags

Use consistent tags for special documentation:

```javascript
// TODO: Implement caching for better performance
// FIXME: This breaks when user has no email
// HACK: Workaround for Safari bug, remove when fixed
// NOTE: This function is called from multiple places
// SECURITY: Ensure input is validated before use
// PERFORMANCE: O(n²) - consider optimization for large datasets
// DEPRECATED: Use newFunction() instead
```

---

## Documentation Maintenance

### Review Triggers
Update documentation when:
- Adding new features
- Changing API contracts
- Modifying configuration options
- Fixing bugs (update if related docs exist)
- Deprecating features

### Documentation in Pull Requests
- Include doc updates in same PR as code changes
- Review documentation changes during code review
- Add documentation-only PRs for improvements
