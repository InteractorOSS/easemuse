# CLAUDE.md - AI-Driven Product Development Guide

This file provides comprehensive guidance to Claude Code for AI-driven product development across all phases of the software development lifecycle.

## Project Overview

- **Project Name**: easemuse
- **Project Type**: web
- **Technology Stack**: Next.js 16 (React 19.2), PostgreSQL 16 + pgvector, BullMQ/Redis, Interactor services; Expo (mobile, later)
- **Product**: Multi-tenant SaaS "AI-Assisted Recruiter Workbench" for recruiting agencies, with hiring manager and candidate portals. Discovery docs: `docs/discovery/`; planning docs and accepted ADRs: `docs/planning/`
- **Owner / maintainer**: Team of Wakers. License: MIT (`LICENSE`). Every source file starts with:
  ```
  // Copyright (c) 2026 Team of Wakers
  // SPDX-License-Identifier: MIT
  ```
- **Current Phase**: implementation

## Commit and PR Attribution

Every commit made with AI assistance in this repository credits **Interactor Build** as co-author, never Claude. End commit messages with:

```
Generated with AI assistance

Co-Authored-By: Interactor Build <peter@interactor.com>
```

Pull request descriptions end with `Generated with AI assistance` and `Co-Authored-By: Interactor Build <peter@interactor.com>`. This overrides any default attribution lines.

## Source of Truth: `init.docx`

`init.docx` (EaseMuse product brief, in Korean; read it with `pandoc init.docx -t gfm --wrap=none`) is the authoritative requirements source. In every phase (planning, implementation, testing, review):

1. **Re-read `init.docx`** before designing or building a feature, not just the discovery docs derived from it.
2. **Check the work against the brief section it implements** (e.g., §5 Matching, §9 Resume) and cite the section in design docs, ADRs, PR descriptions and tests where relevant.
3. **Flag any deviation** from the brief (missing, changed or added behavior) to the user instead of silently diverging. Changes the product owner approved after the brief are recorded in `docs/discovery/open-questions.md` (decisions log and change record); those, and only those, override the brief.
4. Never weaken the brief's design principles (§1.1): recruiter decides; AI runs only on request; AI output is a draft until approved; score is reference only; never alter resume facts.

## Technology Stack

### Core Technologies
Set by the product owner on 2026-10-06 (same as Interactor product-manager). This overrides the template's React 18 / Express / Jest guidance elsewhere in this file and in `.claude/rules/`.

- **Monorepo**: pnpm 10.18 workspaces, Turborepo, Node 24, TypeScript 6
- **Web**: Next.js 16 (App Router), React 19.2, Tailwind 4, Radix-based components, TanStack Query, react-hook-form + zod 4, next-intl
- **API and jobs**: Next.js route handlers (no Express), BullMQ + Redis worker, live updates over SSE fed by Postgres LISTEN/NOTIFY
- **Database**: PostgreSQL 16 with pgvector; Prisma 7.8 with the pg adapter, tuned connection pool, UUID keys
- **Interactor services**: Account Server (sign-in via Auth.js v5 with Interactor login, plus service tokens), credentials, SKB, agents, workflows, webhooks, Billing Server (no Stripe), UKB, userdb
- **Mobile**: Expo 56, React Native 0.86, expo-router (not in release 1)
- **Quality**: Vitest 4, Playwright + axe, ESLint 9, Prettier, commitlint, gitleaks, import-cycle and license-header checks
- **Infra**: out of scope for these docs (per product owner)

### Key Concepts
- **Components**: Functional components with hooks; React Server Components where they fit the App Router
- **Server state**: TanStack Query; **forms**: react-hook-form + zod 4
- **API Design**: REST-style Next.js route handlers; long work in BullMQ jobs, progress over SSE
- **Database Access**: Prisma Client with type safety; every tenant-owned row scoped by `tenantId` (plus Postgres RLS, per Planning ADR)
- **Validation**: zod 4 schemas shared by UI forms, API and AI structured outputs
- **AI rules**: AI runs only on a user action, outputs are drafts until a recruiter approves, provenance recorded (see `docs/discovery/01-problem-statement.md`, DP-1 to DP-6)
- **Testing**: Vitest, Playwright + axe; AI evaluation suite for prompt/model changes

## Quick Reference

### Slash Commands

| Command | Description |
|---------|-------------|
| `/start-discovery` | Begin requirements gathering phase |
| `/start-planning` | Start architecture and planning phase |
| `/start-implementation` | Begin development phase |
| `/run-review` | Execute code review workflow |
| `/prepare-release` | Prepare for deployment |
| `/handle-change` | Process requirement/design changes mid-project |

### Skills

| Skill | Usage |
|-------|-------|
| `code-review` | Comprehensive code quality analysis |
| `security-audit` | OWASP-based security scanning |
| `doc-generator` | Auto-generate documentation |
| `test-generator` | Generate test scaffolds |
| `architecture-planner` | Design system architecture |
| `deployment` | Deployment preparation and verification |
| `validator` | **Validate any artifact for correctness** (use after every generation) |

---

## Development Workflow

### Phase 1: Discovery

**Objective**: Understand the problem space and gather requirements.

When working on discovery tasks:
1. Use `/start-discovery` to initialize the phase
2. Reference `docs/phases/01-discovery/` for templates
3. Create stakeholder analysis using provided template
4. Document requirements in user story format
5. Validate requirements against business goals

**Key deliverables**:
- Problem statement document
- Stakeholder analysis
- Requirements document with user stories
- Research summary

**Exit criteria**: Requirements prioritized and approved by stakeholders.

---

### Phase 2: Planning

**Objective**: Design architecture and create implementation plan.

When working on planning tasks:
1. Use `/start-planning` to initialize the phase
2. Create architecture using `docs/templates/design-doc-template.md`
3. Break down work using `docs/phases/02-planning/task-breakdown.md`
4. Document decisions using ADR template
5. Identify and assess risks

**Key deliverables**:
- Architecture design document
- Task breakdown with estimates
- Architecture Decision Records (ADRs)
- Risk assessment

**Exit criteria**: Architecture approved, tasks estimated, risks mitigated.

---

### Phase 3: Implementation

**Objective**: Write code following established standards.

When writing code:
1. Use `/start-implementation` to setup the phase
2. Follow `.claude/rules/code-style.md` for formatting
3. Apply TDD - write tests first when possible
4. Use meaningful commit messages per `.claude/rules/git-workflow.md`
5. Reference `docs/phases/03-implementation/ai-collaboration-guide.md`

**Best practices**:
- Commit frequently with atomic changes
- Write self-documenting code
- Handle errors appropriately
- Never hardcode secrets or credentials

**Exit criteria**: Feature complete, tests passing, code reviewed.

---

### Phase 4: Testing

**Objective**: Ensure quality through comprehensive testing.

When testing:
1. Follow `.claude/rules/testing.md` for requirements
2. Achieve minimum coverage thresholds
3. Include unit, integration, and e2e tests
4. Use `test-generator` skill for scaffolding
5. Document test scenarios

**Coverage requirements**:
- Minimum overall: 80%
- Critical paths: 100%
- New code: Must include tests

**Exit criteria**: All tests passing, coverage met, quality gates passed.

---

### Phase 5: Review

**Objective**: Validate code quality, security, and performance.

When reviewing:
1. Use `/run-review` to execute review workflow
2. Use `code-review` skill for automated analysis
3. Complete security checklist from `security-audit` skill
4. Check performance benchmarks
5. Verify accessibility requirements

**Review checklist**:
- [ ] Code quality and maintainability
- [ ] Security vulnerabilities
- [ ] Performance issues
- [ ] Test coverage
- [ ] Documentation completeness

**Exit criteria**: All review items addressed, approvals obtained.

---

### Phase 6: Deployment

**Objective**: Release to production safely.

When deploying:
1. Use `/prepare-release` to run deployment checklist
2. Use `deployment` skill for verification
3. Complete release checklist
4. Verify CI/CD pipeline
5. Set up monitoring and alerts

**Pre-deployment checklist**:
- [ ] All tests passing
- [ ] Security audit complete
- [ ] Documentation updated
- [ ] Rollback plan documented
- [ ] Monitoring configured

**Exit criteria**: Successful production deployment, monitoring active.

---

## Iterative Changes & Rework

Real projects rarely follow a linear path. Requirements change, designs evolve, and issues surface late. Here's how to handle changes at any phase.

### Change Triggers

| Trigger | Impact | Action |
|---------|--------|--------|
| New requirement discovered | May affect architecture | Assess scope, update docs, possibly re-plan |
| Bug found in production | Code + possibly design | Fix, add tests, update if pattern issue |
| Performance issue | Implementation | Profile, fix, document learnings |
| User feedback | Requirements + UI/UX | Update requirements, prioritize changes |
| Security vulnerability | Immediate | Hotfix, then root cause analysis |
| Scope change from stakeholder | All phases | Re-assess, update ADRs, re-plan affected areas |

### Handling Changes by Current Phase

**During Implementation (most common):**
```
Change Request
     |
     v
+---------------------------------------------+
|  1. Assess Impact                           |
|     * Does this change the architecture?    |
|     * Does this invalidate existing code    |
|     * What tests need updating?             |
+---------------------------------------------+
     |
     +--- Small (same architecture) ---> Update code + tests, continue
     |
     +--- Large (architecture change) --> Go back to Planning
                                              |
                                              v
                                         Update ADR
                                         Revise design doc
                                         Re-estimate tasks
                                         Resume implementation
```

**After Deployment:**
```
Issue/Change Request
     |
     v
+---------------------------------------------+
|  Severity Assessment                        |
|  * P0: Production down -> Hotfix NOW        |
|  * P1: Major bug -> Fix this sprint         |
|  * P2: Minor issue -> Backlog               |
|  * Feature request -> New discovery         |
+---------------------------------------------+
     |
     +--- Hotfix --> Fix -> Test -> Deploy -> Post-mortem -> Update docs
     |
     +--- Feature --> Mini-discovery -> Planning -> Implementation -> ...
```

### When to Loop Back

| Situation | Go Back To | What to Update |
|-----------|------------|----------------|
| "We need a completely different approach" | Planning | ADR, design doc, task breakdown |
| "New stakeholder requirements" | Discovery | Requirements doc, user stories |
| "This feature is more complex than expected" | Planning | Task breakdown, estimates, possibly ADR |
| "Tests revealed design flaw" | Planning | Design doc, ADR if architectural |
| "Performance won't meet SLA" | Planning | ADR for optimization approach |
| "Security audit failed" | Implementation | Fix code, update security checklist |

### Change Documentation

When making significant changes, document them:

```markdown
## Change Record

**Date**: YYYY-MM-DD
**Type**: Requirement / Architecture / Implementation / Hotfix
**Triggered by**: [What caused this change]

### Original Approach
[What was planned/built]

### New Approach
[What changed and why]

### Impact
- [ ] Requirements doc updated
- [ ] ADR created/updated
- [ ] Design doc updated
- [ ] Affected code refactored
- [ ] Tests updated
- [ ] Documentation updated

### Lessons Learned
[What to do differently next time]
```

### Mini-Cycles for Changes

For changes that don't require full phase restarts:

```
+--------------------------------------------------------------+
|                    Mini-Cycle                                 |
|                                                               |
|   Assess -> Plan (brief) -> Implement -> Test -> Review      |
|     |                                            |            |
|     +------------------- Validate <--------------+            |
+--------------------------------------------------------------+
```

1. **Assess**: What's the scope? Does it change architecture?
2. **Plan**: Quick task list, update ADR if needed
3. **Implement**: Make changes following existing patterns
4. **Test**: Run full validation suite
5. **Review**: Code review, check for regressions

---

## AI Collaboration Guidelines

### DO

- Ask clarifying questions before major implementations
- Propose architecture before coding complex features
- Write tests alongside implementation
- Document decisions and rationale
- Reference existing patterns in codebase
- Use provided skills and commands for workflows
- Break down large tasks into smaller steps

### DON'T

- Skip testing or security considerations
- Make breaking changes without discussion
- Hard-code secrets, credentials, or environment-specific values
- Bypass pre-commit hooks or quality gates
- Assume requirements - ask when unclear
- Over-engineer simple solutions

---

## Validation Requirements

**Every generated artifact must be validated before moving forward.**

### Automatic Validation

After generating any output, run the `validator` skill to ensure correctness:

| Artifact | Validation |
|----------|------------|
| Requirements/User Stories | Completeness, clarity, no ambiguity |
| Architecture/Design | Technical correctness, patterns |
| Code (TypeScript) | Compiles, formatted, passes linting |
| Migrations | Reversible, safe, correct types |
| Tests | Pass, adequate coverage, no flaky tests |

### Validation Commands

```bash
# Always run after code generation
npm run build                    # Must pass
npm run lint                     # Must pass
npm run format:check             # Must pass
npm test                         # Must pass

# Before commits
npm run test:coverage            # Check coverage
npm run audit                    # Security check
```

### Phase Gate Validation

Before transitioning between phases, validate:

| Transition | Required Validations |
|------------|---------------------|
| Discovery -> Planning | Requirements complete, stakeholders identified |
| Planning -> Implementation | Architecture reviewed, tasks broken down |
| Implementation -> Testing | Code compiles, basic tests pass |
| Testing -> Review | All tests pass, coverage met |
| Review -> Deployment | Security audit, performance checked |

### Validation Report Format

After validation, report results as:

```
Pass: [Check name]
Fail: [Check name] - [Issue and fix]
Warn: [Check name] - [Recommendation]
```

---

## Project Structure

### Monorepo Structure (Recommended)

```
project/
+-- apps/
|   +-- web/                     # React web application
|   |   +-- src/
|   |   |   +-- components/      # Reusable UI components
|   |   |   +-- pages/           # Route components
|   |   |   +-- hooks/           # Custom hooks
|   |   |   +-- store/           # State management
|   |   |   +-- services/        # API clients
|   |   |   +-- utils/           # Utilities
|   |   |   +-- types/           # TypeScript types
|   |   |   +-- App.tsx
|   |   |   +-- main.tsx
|   |   +-- tests/               # Test files
|   |   +-- package.json
|   |
|   +-- mobile/                  # React Native application
|   |   +-- src/
|   |   |   +-- components/
|   |   |   +-- screens/
|   |   |   +-- navigation/
|   |   |   +-- hooks/
|   |   |   +-- services/
|   |   +-- package.json
|   |
|   +-- api/                     # Express.js backend
|       +-- src/
|       |   +-- routes/          # API routes
|       |   +-- controllers/     # Route handlers
|       |   +-- services/        # Business logic
|       |   +-- middleware/      # Express middleware
|       |   +-- models/          # Database models (Prisma)
|       |   +-- utils/           # Utilities
|       |   +-- types/           # TypeScript types
|       |   +-- app.ts           # Express app setup
|       |   +-- server.ts        # Server entry point
|       +-- prisma/
|       |   +-- schema.prisma    # Database schema
|       |   +-- migrations/      # Database migrations
|       +-- tests/               # Test files
|       +-- package.json
|
+-- packages/
|   +-- shared/                  # Shared code between apps
|       +-- src/
|       |   +-- types/           # Shared TypeScript types
|       |   +-- utils/           # Shared utilities
|       |   +-- constants/       # Shared constants
|       +-- package.json
|
+-- docs/                        # Project documentation
+-- scripts/                     # Build and deployment scripts
+-- package.json                 # Root package.json (workspaces)
+-- turbo.json                   # Turborepo config (optional)
```

### Single Backend Structure

```
project/
+-- src/
|   +-- routes/                  # API route definitions
|   |   +-- auth.routes.ts
|   |   +-- users.routes.ts
|   |   +-- index.ts
|   +-- controllers/             # Request handlers
|   |   +-- auth.controller.ts
|   |   +-- users.controller.ts
|   +-- services/                # Business logic
|   |   +-- auth.service.ts
|   |   +-- users.service.ts
|   +-- middleware/              # Express middleware
|   |   +-- auth.middleware.ts
|   |   +-- error.middleware.ts
|   |   +-- validation.middleware.ts
|   +-- models/                  # Prisma client & types
|   +-- utils/                   # Utility functions
|   +-- types/                   # TypeScript type definitions
|   +-- config/                  # Configuration files
|   +-- app.ts                   # Express app configuration
|   +-- server.ts                # Server entry point
|
+-- prisma/
|   +-- schema.prisma            # Database schema
|   +-- migrations/              # Database migrations
|   +-- seed.ts                  # Database seeding
|
+-- tests/
|   +-- unit/                    # Unit tests
|   +-- integration/             # Integration tests
|   +-- e2e/                     # End-to-end tests
|
+-- package.json
+-- tsconfig.json
+-- .env.example
```

---

## Common Commands

```bash
# Development
npm run dev                      # Start development server
npm run dev:api                  # Start API server only
npm run dev:web                  # Start web app only

# Database (Prisma)
npx prisma generate              # Generate Prisma Client
npx prisma migrate dev           # Run migrations (development)
npx prisma migrate deploy        # Run migrations (production)
npx prisma db push               # Push schema changes (no migration)
npx prisma studio                # Open Prisma Studio GUI
npx prisma db seed               # Run database seeding

# Code Generation
npx prisma migrate dev --name <name>  # Create migration

# Testing
npm test                         # Run all tests
npm run test:watch               # Run tests in watch mode
npm run test:coverage            # Run with coverage
npm run test:e2e                 # Run E2E tests

# Code Quality
npm run lint                     # Run ESLint
npm run lint:fix                 # Fix linting issues
npm run format                   # Format with Prettier
npm run format:check             # Check formatting
npm run typecheck                # Run TypeScript checks

# Build
npm run build                    # Build for production
npm run build:api                # Build API only
npm run build:web                # Build web app only
npm start                        # Start production server
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/test/production) | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `PORT` | Server port (default: 3000) | No |
| `CORS_ORIGIN` | Allowed CORS origins | No |
| `REDIS_URL` | Redis connection string (for queues) | No |

See `.env.example` for all available variables. Local values go in **`.env.local`** (git-ignored), never `.env`.

---

## Key Resources

### Documentation

- `docs/phases/` - Phase-specific documentation and templates
- `docs/templates/` - Document templates (PRD, ADR, Design Doc)
- `docs/checklists/` - Comprehensive project checklists

### Configuration

- `.claude/skills/` - AI skills for specialized tasks
- `.claude/commands/` - Slash commands for workflows
- `.claude/rules/` - Modular development rules
- `.claude/settings.json` - Team settings and permissions

### Platform-Specific

- `config/web/` - Web project configuration
- `config/mobile/` - Mobile project configuration
- `config/backend/` - Backend project configuration
- `config/cli/` - CLI project configuration

---

## Getting Started

1. Run `./scripts/setup/init-project.sh <project-name> <type>` to initialize
2. Update this CLAUDE.md with your project specifics
3. Configure `.claude/settings.json` for your team
4. Set up environment variables: copy `.env.example` to `.env.local` (git-ignored; holds the Interactor client id/secret and other secrets)
5. Use `/start-discovery` to begin the development process

---

## Platform-Specific Configuration

# Web Project Configuration

## Technology Stack

This is a web application project. Apply the following technology-specific guidance.

### Frontend Framework
- **React 18+** with TypeScript
- Vite for development and builds

### Build Tools
- **Vite** / Next.js / Remix

### Styling
- **Tailwind CSS** / CSS Modules / Styled Components / Emotion

### State Management
- **React Query** for server state
- **Zustand** / Redux Toolkit for client state

---

## Project Structure

```
src/
├── app/                 # App entry, routing
├── components/
│   ├── ui/              # Base components (Button, Input, Modal)
│   ├── layout/          # Layout components (Header, Footer, Sidebar)
│   └── features/        # Feature-specific components
├── hooks/               # Custom React hooks
├── lib/                 # Utility libraries, configurations
├── services/            # API services, external integrations
├── stores/              # State management
├── styles/              # Global styles, themes
├── types/               # TypeScript type definitions
└── utils/               # Utility functions
```

---

## Commands

```bash
# Development
npm run dev              # Start development server (usually port 5173)
npm run build            # Production build
npm run preview          # Preview production build
npm run start            # Start production server

# Testing
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
npm run test:e2e         # End-to-end tests

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix lint issues
npm run format           # Format with Prettier
npm run typecheck        # TypeScript check
```

---

## Component Guidelines

### Structure
```tsx
// ComponentName.tsx
import { useState } from 'react';
import type { ComponentNameProps } from './types';

export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  const [state, setState] = useState(initialValue);

  return (
    <div className="container">
      {/* Component content */}
    </div>
  );
}
```

### Best Practices
- Use functional components with hooks
- Co-locate tests with components (`Component.test.tsx`)
- Use TypeScript for props and state
- Implement accessibility (ARIA labels, keyboard nav)
- Use semantic HTML elements
- Keep components focused and small

---

## State Management

### Server State (API Data)
```tsx
// Use React Query for server state
import { useQuery, useMutation } from '@tanstack/react-query';

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });
}
```

### Client State (UI State)
```tsx
// Use local state or lightweight stores
import { create } from 'zustand';

const useUIStore = create((set) => ({
  isMenuOpen: false,
  toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
}));
```

---

## API Integration

### API Service Pattern
```typescript
// services/api/users.ts
import { api } from '@/lib/api';

export const usersApi = {
  getAll: () => api.get<User[]>('/users'),
  getById: (id: string) => api.get<User>(`/users/${id}`),
  create: (data: CreateUserInput) => api.post<User>('/users', data),
  update: (id: string, data: UpdateUserInput) => api.put<User>(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};
```

---

## Performance Considerations

### Code Splitting
```tsx
// Lazy load routes and heavy components
const Dashboard = lazy(() => import('./pages/Dashboard'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
```

### Image Optimization
```tsx
// Use optimized image components
<img
  src="/hero.jpg"
  alt="Hero"
  loading="lazy"
  width={1200}
  height={600}
/>
```

### Memoization
```tsx
// Memoize expensive computations
const expensiveResult = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

// Memoize callbacks passed to children
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);
```

---

## Testing

### Component Testing
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('calls onClick when clicked', async () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### E2E Testing
```typescript
// Playwright example
import { test, expect } from '@playwright/test';

test('user can complete checkout', async ({ page }) => {
  await page.goto('/products');
  await page.click('[data-testid="add-to-cart"]');
  await page.click('[data-testid="checkout"]');
  await expect(page.locator('h1')).toContainText('Order Confirmed');
});
```

---

## Security

### XSS Prevention
- React escapes by default
- Use `DOMPurify` for HTML content
- Avoid `dangerouslySetInnerHTML`

### Authentication
- Store tokens in httpOnly cookies (preferred)
- Use secure session management
- Implement CSRF protection

### CSP Headers
```javascript
// vite.config.ts or server config
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
  }
];
```

---

## Accessibility

### Checklist
- [ ] Semantic HTML elements used
- [ ] ARIA labels where needed
- [ ] Keyboard navigation works
- [ ] Focus states visible
- [ ] Color contrast sufficient (4.5:1)
- [ ] Alt text for images
- [ ] Form labels connected to inputs

### Tools
- axe DevTools browser extension
- Lighthouse accessibility audit
- WAVE accessibility checker

<!-- BEGIN INTERACTOR ENGINE WORKFLOW (managed by Interactor Build - edits inside this block are overwritten) -->
# Interactor Build — Engine Workflow

This repository is connected to [Interactor Build](https://build.interactor.com).
Build tracks and ships every change to **EaseMuse** (`InteractorOSS/easemuse`) through the **engine**: a tracked
**Goal**, work on the goal's branch, and a single pull request. This guide is the
contract for how work is structured here — read it before editing code.

## The model: Goals and EngineTasks

- **Goal** — the *objective*: a bug, feature, or outcome to address. A Goal owns the
  integration **branch and pull request**, and is the unit a **GitHub issue maps to**
  (**issue → Goal**). A single-repo goal is one branch + one PR.
- **EngineTask** — a *unit of work beneath a Goal*: the breakdown that fulfils it
  (a planning task, then implementation tasks, …). EngineTasks are **not** 1:1 with
  GitHub issues — the engine generates them under the Goal.
- Each EngineTask cycles through **investigation → execution → review**. Those are
  phases *of a task*, not separate tasks or issues.

## The gate — before you edit any code

Every code change ships through the engine. Reading (files, `git log`, `git diff`,
grep) is always fine; the gate applies the moment you would write a file. In order:

1. **A tracked Goal must exist.** No Goal → no edits. Create one (see entry points
   below) before touching a file.
2. **Work on the goal branch `goal/<goalId>`, in an isolated worktree — never on
   `main`.** Direct commits to `main` bypass review and cannot be reverted cleanly.
3. **All changes ship via the goal's PR.** The engine opens the PR; it passes the
   review + CI gates before it merges. No direct pushes to `main`.

If you find yourself about to edit a file with no tracked Goal: **stop**, create the
Goal, and start it — then work on its branch.

An interactive Claude Code session may turn this gate off for itself for a small change with
`ibuild off` (and back on with `ibuild on`) if the project allows it — the change still lands
on its own branch through a hand-opened pull request that runs CI, just without a tracked Goal.

## How to drive it

**Primary entry point (always available):**

- **The Build web UI** — create and manage Goals at
  [build.interactor.com](https://build.interactor.com). This is the entry point that
  always works, including on a freshly-connected repo.
- **Open a GitHub issue** — issue creation alone does **not** create a Goal. The
  importer does not run automatically; landing it as a Goal takes an explicit import
  step (ask the PM AI assistant to import it, or call the bulk-import API), and once
  imported it lands as a **Goal**, with the engine generating the tasks beneath it.

**From the terminal — the `ibuild` binary (v1.1+):** the same CLI that syncs this
repo also carries the engine commands, so a connected repo drives the full lifecycle
locally with no extra setup:

- `ibuild engine goal-create "<title>"` — create a Goal;
  `ibuild engine goal queue <goalId>` — admit it.
- `ibuild engine work <task>` / `ibuild engine report --yes` — work a task and
  report the phase; `ibuild engine goal accept <goalId>` — deliver the merged goal.
  (A claim or a success report changes state shared with the fleet, so it confirms
  first — `--yes` is the non-interactive form, `--dry-run` previews it.)
- Run `ibuild engine` for the full command list, and see the scaffolded
  `.claude/commands/i/engine-*.md` docs (the `/i/engine-*` skills) for
  per-command walkthroughs.

No `ibuild` on this machine (or an older binary without `engine`)? Install or
update it per this repo's Build setup (brew/winget/curl installer) — or just use the
web UI / GitHub issue path above, which always works.
<!-- END INTERACTOR ENGINE WORKFLOW -->

<!-- BEGIN INTERACTOR RULES IMPORT (managed by ibuild — edits inside this block are overwritten) -->
This repo's standing rules for AI sessions live in `.build/RULES.md`, and Claude
Code only auto-loads the repo-root CLAUDE.md, so the line below pulls it in. To stop this
being managed, delete this whole block and leave `<!-- ibuild:rules-import: off -->` somewhere
in this file; it will not come back.

@.build/RULES.md
<!-- END INTERACTOR RULES IMPORT -->
