---
name: architecture-planner
description: Design system architecture, data models, and API contracts. Use during planning phase for new features or systems.
---

# Architecture Planner Skill

Design comprehensive system architectures for React/Express applications.

## When to Use

- During `/start-planning` phase
- Designing new features
- Major refactoring
- System redesign
- Creating ADRs

## Process

### Step 1: Understand Requirements

1. Review requirements document
2. Identify key entities
3. Map user interactions
4. Note performance requirements
5. Identify integrations

### Step 2: Design Components

#### Frontend Architecture (React)

```
src/
├── components/           # Reusable UI components
│   ├── ui/              # Base UI components
│   └── features/        # Feature-specific components
├── pages/               # Route components
├── hooks/               # Custom hooks
├── services/            # API clients
├── store/               # State management
├── utils/               # Utilities
└── types/               # TypeScript types
```

#### Backend Architecture (Express)

```
src/
├── routes/              # API route definitions
├── controllers/         # Request handlers
├── services/            # Business logic
├── middleware/          # Express middleware
├── lib/                 # Shared utilities
│   └── prisma.ts       # Prisma client
├── types/               # TypeScript types
└── config/             # Configuration
```

### Step 3: Data Model Design

Design Prisma schema:

```prisma
// Example schema structure
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  posts     Post[]
  profile   Profile?
}

model Profile {
  id     String @id @default(cuid())
  bio    String?
  avatar String?
  userId String @unique
  user   User   @relation(fields: [userId], references: [id])
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  USER
  ADMIN
}
```

### Step 4: API Design

Design RESTful endpoints:

```markdown
## API Endpoints

### Users
- `GET    /api/users`          - List users (admin)
- `GET    /api/users/:id`      - Get user
- `POST   /api/users`          - Create user
- `PUT    /api/users/:id`      - Update user
- `DELETE /api/users/:id`      - Delete user

### Authentication
- `POST   /api/auth/register`  - Register
- `POST   /api/auth/login`     - Login
- `POST   /api/auth/logout`    - Logout
- `POST   /api/auth/refresh`   - Refresh token
- `GET    /api/auth/me`        - Current user

### Posts
- `GET    /api/posts`          - List posts
- `GET    /api/posts/:id`      - Get post
- `POST   /api/posts`          - Create post
- `PUT    /api/posts/:id`      - Update post
- `DELETE /api/posts/:id`      - Delete post
```

### Step 5: Component Architecture

Design component hierarchy:

```markdown
## Component Hierarchy

App
├── Layout
│   ├── Header
│   │   ├── Logo
│   │   ├── Navigation
│   │   └── UserMenu
│   ├── Sidebar (optional)
│   └── Footer
├── Pages
│   ├── HomePage
│   ├── LoginPage
│   ├── DashboardPage
│   └── ProfilePage
└── Providers
    ├── AuthProvider
    ├── ThemeProvider
    └── QueryProvider
```

### Step 6: State Management

Design state structure:

```typescript
// Global state (Zustand/Redux)
interface AppState {
  auth: {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
  };
  ui: {
    sidebarOpen: boolean;
    theme: 'light' | 'dark';
  };
}

// Server state (React Query)
// - User data
// - Posts data
// - Comments data
```

## Output Format

```markdown
## Architecture Design Document

### Overview
[Brief description of the system]

### Technology Stack
- **Frontend**: React 18, TypeScript, TailwindCSS
- **Backend**: Express.js, Node.js 20
- **Database**: PostgreSQL, Prisma ORM
- **Authentication**: JWT
- **State Management**: Zustand + React Query

### Architecture Diagram
[ASCII diagram or reference to diagram]

### Data Model
[Prisma schema with explanations]

### API Design
[Endpoint documentation]

### Component Architecture
[Component hierarchy]

### Security Considerations
- Authentication: JWT with refresh tokens
- Authorization: Role-based access control
- Data protection: [specific measures]

### Performance Considerations
- Caching strategy
- Database indexing
- Code splitting

### Scalability
- Horizontal scaling approach
- Database scaling
- CDN usage

### Open Questions
- [Question 1]
- [Question 2]

### ADR References
- ADR-001: [Decision title]
- ADR-002: [Decision title]
```

## ADR Template

```markdown
# ADR-XXX: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[Why is this decision needed?]

## Decision
[What is the decision?]

## Consequences
[What are the positive and negative outcomes?]

## Alternatives Considered
[What other options were evaluated?]
```
