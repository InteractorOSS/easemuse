# React/Express Product Development Template

A comprehensive, AI-driven product development template for building web and mobile applications with React, React Native, Express.js, and PostgreSQL.

## Overview

This template provides a complete framework for AI-assisted software development using Claude Code. It includes:

- **Structured Development Phases**: Discovery, Planning, Implementation, Testing, Review, Deployment
- **AI Skills**: Specialized capabilities for code review, security audits, testing, and more
- **Slash Commands**: Workflow automation for common development tasks
- **Documentation Templates**: PRDs, ADRs, design docs, and checklists
- **Platform Configurations**: Pre-configured setups for web, mobile, backend, and CLI projects

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Language** | TypeScript 5.x |
| **Web Frontend** | React 18+, TailwindCSS |
| **Mobile** | React Native with Expo |
| **Backend** | Express.js 4.x, Node.js 20+ |
| **Database** | PostgreSQL with Prisma ORM |
| **Real-time** | Socket.io |
| **Background Jobs** | BullMQ with Redis |
| **Testing** | Jest, React Testing Library, Supertest, Playwright |

## Quick Start

### 1. Initialize Your Project

```bash
# Clone or download this template
git clone <template-repository-url> my-project
cd my-project

# Initialize the project
./scripts/setup/init-project.sh my-project web
```

### 2. Configure Your Environment

```bash
# Copy environment example
cp .env.example .env.local

# Edit .env.local with your values (never commit it)
# DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
# JWT_SECRET=your-secret-key
```

### 3. Start Development

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Start development server
npm run dev
```

### 4. Begin with Claude Code

Open your project in Claude Code and use:

```
/start-discovery
```

to begin the AI-assisted development workflow.

## Project Structure

```
.
+-- .claude/                     # Claude Code configuration
|   +-- commands/                # Slash commands for workflows
|   +-- skills/                  # AI skills for specialized tasks
|   +-- rules/                   # Development rules and standards
|   +-- agents/                  # Agent configurations
|   +-- settings.json            # Team settings
|
+-- config/                      # Platform-specific configurations
|   +-- web/                     # React web configuration
|   +-- mobile/                  # React Native configuration
|   +-- backend/                 # Express.js configuration
|   +-- cli/                     # CLI tool configuration
|
+-- docs/                        # Documentation
|   +-- phases/                  # Phase-specific guides
|   +-- templates/               # Document templates
|   +-- checklists/              # Project checklists
|
+-- scripts/                     # Setup and utility scripts
|   +-- setup/                   # Project initialization
|
+-- CLAUDE.md                    # Main AI guidance document
+-- .env.example                 # Environment variable template
+-- .mcp.json                    # MCP server configuration
```

## Development Workflow

### Phases

1. **Discovery** (`/start-discovery`)
   - Gather requirements
   - Stakeholder analysis
   - User story creation

2. **Planning** (`/start-planning`)
   - Architecture design
   - Task breakdown
   - Risk assessment

3. **Implementation** (`/start-implementation`)
   - Feature development
   - Test-driven development
   - Code reviews

4. **Testing**
   - Unit tests
   - Integration tests
   - E2E tests

5. **Review** (`/run-review`)
   - Code quality checks
   - Security audit
   - Performance review

6. **Deployment** (`/prepare-release`)
   - Release checklist
   - Deployment verification
   - Monitoring setup

### Available Commands

| Command | Description |
|---------|-------------|
| `/start-discovery` | Begin requirements gathering |
| `/start-planning` | Start architecture planning |
| `/start-implementation` | Begin development phase |
| `/run-review` | Execute code review workflow |
| `/prepare-release` | Prepare for deployment |
| `/handle-change` | Process mid-project changes |

### Skills

| Skill | Purpose |
|-------|---------|
| `code-review` | Automated code quality analysis |
| `security-audit` | OWASP-based security scanning |
| `test-generator` | Generate test scaffolds |
| `doc-generator` | Auto-generate documentation |
| `architecture-planner` | Design system architecture |
| `deployment` | Deployment verification |
| `validator` | Artifact validation |

## Validation Commands

```bash
# Code quality
npm run typecheck              # TypeScript compilation
npm run lint                   # ESLint checks
npm run format:check           # Prettier formatting

# Testing
npm test                       # Run all tests
npm run test:coverage          # Coverage report (>= 80%)
npm run test:e2e               # E2E tests with Playwright

# Security
npm audit --audit-level=high   # Dependency security

# Build
npm run build                  # Production build
```

### One-liner Validation

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm audit --audit-level=high && npm run build
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/test/production) | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret (64+ chars) | Yes |
| `PORT` | Server port (default: 3000) | No |
| `CORS_ORIGIN` | Allowed CORS origins | No |
| `REDIS_URL` | Redis connection for BullMQ | No |

### MCP Server Integration

The template includes MCP server configuration in `.mcp.json`:

- **Context7**: Documentation and library references
- **Sequential**: Complex analysis workflows
- **Playwright**: E2E testing

## Platform Configurations

### Web (`config/web/`)
React web application with:
- Component architecture
- State management patterns
- Responsive design
- Accessibility guidelines

### Mobile (`config/mobile/`)
React Native/Expo application with:
- Navigation patterns
- Platform-specific code
- Performance optimization
- App store guidelines

### Backend (`config/backend/`)
Express.js API with:
- RESTful patterns
- Prisma ORM integration
- Authentication middleware
- Background job processing

### CLI (`config/cli/`)
Command-line tools with:
- Commander.js patterns
- Interactive prompts
- Progress indicators
- Distribution setup

## Syncing Template Updates

To pull updates from the template:

```bash
./scripts/setup/sync-template.sh
```

Options:
- `skills` - Sync AI skills
- `commands` - Sync slash commands
- `rules` - Sync development rules
- `docs` - Sync documentation
- `all` - Sync everything

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Reporting issues
- Suggesting improvements
- Contributing changes
- Code of conduct

## License

MIT License - See [LICENSE](LICENSE) for details.

## Resources

- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- [React Documentation](https://react.dev)
- [Express.js Documentation](https://expressjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [React Native Documentation](https://reactnative.dev)
