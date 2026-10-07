# Start Implementation Phase

Initialize the Implementation phase for coding and development.

## Instructions

When this command is invoked, perform the following:

### 1. Verify Planning Completion

Check if planning artifacts exist:
- `docs/planning/architecture.md`
- `docs/planning/tasks.md`

If missing, warn that planning phase may be incomplete.

### 2. Set Context

Update the project phase in CLAUDE.md to "implementation".

### 3. Development Environment Check

Verify development setup:
- [ ] Dependencies installed (`npm install`)
- [ ] Environment variables configured (`.env`)
- [ ] Database created and migrated (`npx prisma migrate dev`)
- [ ] Development server runs (`npm run dev`)
- [ ] Tests can execute (`npm test`)

### Port Configuration

**Development**: Use port **3000** or as configured in `.env`.
**Production**: Use port from `PORT` environment variable.

Configure in `.env`:
```bash
PORT=3000
```

### 4. Display Implementation Guidelines

```markdown
## Implementation Phase Guidelines

### Before Coding
1. Review the task requirements
2. Understand the acceptance criteria
3. Check related architecture decisions
4. Identify test cases first (TDD)

### While Coding
1. Follow code style guidelines (`.claude/rules/code-style.md`)
2. Write tests alongside code
3. Commit frequently with meaningful messages
4. Keep changes focused and atomic

### Code Review Preparation
1. Self-review before requesting review
2. Ensure tests pass
3. Update documentation if needed
4. Run linter and formatter

### AI Collaboration Tips
- Explain context before asking for help
- Review generated code carefully
- Ask for explanations when unclear
- Request tests for generated code
```

### 5. Display Current Tasks

If `docs/planning/tasks.md` exists, show:
- Current sprint/milestone tasks
- Task priorities
- Dependencies

### 6. Suggested Prompts

```
"Help me implement [feature] based on the architecture"
"Write tests for [function/component]"
"Review this code for [concerns]"
"Refactor [code] to improve [aspect]"
"Add error handling to [function]"
"Implement [pattern] for [use case]"
```

### 7. Available Skills

```markdown
### Skills for Implementation
- `code-review` - Review code for quality and security
- `test-generator` - Generate test scaffolds
- `doc-generator` - Update documentation
```

### 8. Create Development Start Script

Create `./scripts/start.sh` - a comprehensive development startup script that:

1. **Checks all dependencies**:
   - Node.js version (via nvm or system)
   - npm/yarn/pnpm
   - PostgreSQL running and accessible
   - Redis running (if using queues)

2. **Validates environment setup**:
   - `.env` file exists with required variables
   - Database configured and accessible
   - Required environment variables set

3. **Auto-setup if environment not ready**:
   - Prompt user to install missing dependencies
   - Offer to create `.env` from `.env.example`
   - Run `npm install` if node_modules missing
   - Run `npx prisma migrate dev` if database not initialized
   - Run `npx prisma generate` if Prisma client not generated

4. **Starts the development server**:
   - Run migrations if pending
   - Start development server
   - Display helpful startup information

```bash
#!/usr/bin/env bash
# ./scripts/start.sh - Development environment startup script
#
# Usage: ./scripts/start.sh [options]
# Options:
#   --check-only    Only check dependencies, don't start server
#   --setup         Run full setup (deps, db)
#   --skip-checks   Skip dependency checks and start immediately
```

**Required behavior**:
- Exit with clear error messages if critical dependencies missing
- Offer interactive prompts for fixable issues
- Support `--help` flag for usage information
- Be idempotent (safe to run multiple times)
- Work on macOS and Linux

## Output

```markdown
## Implementation Phase Initialized

**Status**: Ready for development

### Architecture Summary
[Show key points from architecture doc if available]

### Current Tasks
[List tasks from planning if available]

### Development Checklist
- [ ] Environment configured
- [ ] Dependencies installed
- [ ] Database migrated
- [ ] Tests running
- [ ] Linter configured

### Guidelines Reference
- Code style: `.claude/rules/code-style.md`
- Testing: `.claude/rules/testing.md`
- Security: `.claude/rules/security.md`
- Git workflow: `.claude/rules/git-workflow.md`

### Skills Available
- `code-review` - Code quality analysis
- `test-generator` - Create test scaffolds
- `doc-generator` - Update documentation

### Quick Commands
```bash
npm run dev          # Start development server
npm test             # Run tests
npm run lint         # Run linter
npm run format       # Format code
npx prisma studio    # Open database GUI
```

What would you like to implement first?
```

## Validation Requirements

### Entry Validation
Before starting implementation, verify planning outputs:
```
"Validate planning documents"
```

### During Implementation - Validate Every Change

After generating ANY code, run these validation commands:

```bash
# Required after every code generation
npm run build                  # Must pass (TypeScript compilation)
npm run lint                   # Must pass
npm run format:check           # Must pass

# After writing tests
npm test                       # Must pass
```

### Code Generation Validation Checklist

After generating each type of code:

| Generated Code | Validation |
|---------------|------------|
| Prisma Schema | `npx prisma validate`, `npx prisma generate` |
| Service functions | `npm run build`, verify types |
| React Components | Check props types, hooks usage |
| API Routes | Verify middleware, proper responses |
| Tests | `npm test`, verify meaningful assertions |

### Continuous Validation

Run after each significant change:
```bash
# Quick validation
npm run typecheck  # Check TypeScript errors
npm run lint       # Check linting
```

### Exit Gate Validation
Before proceeding to `/run-review`:

- [ ] All code compiles without errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] Linting passes (`npm run lint`)
- [ ] Coverage meets minimum threshold
- [ ] No TODO comments left in code

Run the `validator` skill:
```
"Validate the implementation before code review"
```
