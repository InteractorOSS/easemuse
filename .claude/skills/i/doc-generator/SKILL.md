---
name: doc-generator
description: Generate and update project documentation including README, API docs, and code comments. Use when creating or updating documentation.
---

# Documentation Generator Skill

Generate comprehensive project documentation.

## When to Use

- Creating initial documentation
- Updating docs after changes
- Generating API documentation
- Adding code comments

## Documentation Types

### 1. README Generation

```markdown
# Project Name

Brief description of what this project does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS
- **Backend**: Express.js, Node.js 20
- **Database**: PostgreSQL, Prisma ORM
- **Testing**: Jest, React Testing Library

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm or yarn

## Getting Started

### Installation

\`\`\`bash
# Clone repository
git clone <repo-url>
cd project-name

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Set up database
npx prisma migrate dev

# Start development server
npm run dev
\`\`\`

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `PORT` | Server port | No | 3000 |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm test` | Run tests |
| `npm run lint` | Run linter |

## API Documentation

See [API.md](./docs/API.md) for full API documentation.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

MIT
```

### 2. API Documentation

```markdown
# API Documentation

Base URL: `https://api.example.com/v1`

## Authentication

All authenticated endpoints require a Bearer token:

\`\`\`
Authorization: Bearer <token>
\`\`\`

## Endpoints

### Authentication

#### POST /auth/register

Register a new user.

**Request Body:**
\`\`\`json
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "securePassword123"
}
\`\`\`

**Response (201):**
\`\`\`json
{
  "data": {
    "id": "cuid...",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "jwt..."
}
\`\`\`

**Errors:**
- `400` - Validation error
- `409` - Email already exists

#### POST /auth/login

Login with email and password.

**Request Body:**
\`\`\`json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
\`\`\`

**Response (200):**
\`\`\`json
{
  "data": {
    "id": "cuid...",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "jwt..."
}
\`\`\`

**Errors:**
- `400` - Validation error
- `401` - Invalid credentials

### Users

#### GET /users

List all users (admin only).

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response (200):**
\`\`\`json
{
  "data": [
    {
      "id": "cuid...",
      "email": "user@example.com",
      "name": "John Doe",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
\`\`\`

## Error Responses

All errors follow this format:

\`\`\`json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
\`\`\`

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `UNAUTHORIZED` | 401 | Missing/invalid auth |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `SERVER_ERROR` | 500 | Internal error |
```

### 3. Code Comments (JSDoc/TSDoc)

```typescript
/**
 * User service for managing user operations.
 *
 * @example
 * ```typescript
 * const userService = new UserService();
 * const user = await userService.create({
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   password: 'securePassword123'
 * });
 * ```
 */
export class UserService {
  /**
   * Creates a new user.
   *
   * @param input - User creation data
   * @param input.email - User's email address
   * @param input.name - User's display name
   * @param input.password - User's password (will be hashed)
   * @returns The created user (without password)
   * @throws {ConflictError} If email already exists
   * @throws {ValidationError} If input is invalid
   *
   * @example
   * ```typescript
   * const user = await userService.create({
   *   email: 'user@example.com',
   *   name: 'John',
   *   password: 'secure123'
   * });
   * ```
   */
  async create(input: CreateUserInput): Promise<User> {
    // Implementation
  }
}
```

### 4. Architecture Documentation

```markdown
# Architecture Overview

## System Architecture

\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│     API     │────▶│  Database   │
│   (React)   │◀────│  (Express)  │◀────│ (PostgreSQL)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │   (Cache)   │
                    └─────────────┘
\`\`\`

## Directory Structure

\`\`\`
project/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # Express backend
├── packages/
│   └── shared/       # Shared code
└── docs/             # Documentation
\`\`\`

## Data Flow

1. Client makes request to API
2. API validates request
3. Service layer processes business logic
4. Database operations via Prisma
5. Response returned to client

## Key Decisions

See ADRs in `docs/decisions/`
```

## Output Format

When generating documentation:

```markdown
## Documentation Generated

### Files Created/Updated
- [ ] README.md
- [ ] docs/API.md
- [ ] docs/ARCHITECTURE.md
- [ ] CONTRIBUTING.md
- [ ] CHANGELOG.md

### Coverage
- Public APIs: 100%
- Components: 85%
- Services: 90%

### Recommendations
1. Add examples for complex functions
2. Update API docs for new endpoints
3. Add architecture diagrams
```
