---
name: deployment
description: Prepare and verify deployments with comprehensive checklists. Use during release phase.
---

# Deployment Skill

Comprehensive deployment preparation and verification for React/Express applications.

## When to Use

- During `/prepare-release` phase
- Setting up CI/CD
- Deploying to new environments
- Post-deployment verification

## Deployment Checklist

### Pre-Deployment

```markdown
## Pre-Deployment Checklist

### Code Quality
- [ ] All tests pass (`npm test`)
- [ ] Coverage >= 80%
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Code formatted

### Security
- [ ] npm audit clean
- [ ] No secrets in code
- [ ] Environment variables documented
- [ ] Security headers configured

### Build
- [ ] Production build succeeds
- [ ] Bundle size acceptable
- [ ] No console errors in build

### Database
- [ ] Migrations tested
- [ ] Rollback tested
- [ ] Backup verified
- [ ] Seed data ready (if needed)

### Documentation
- [ ] README updated
- [ ] CHANGELOG updated
- [ ] API docs current
- [ ] Deployment guide updated
```

### Environment Configuration

```bash
# Required environment variables for production

# Application
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Security
JWT_SECRET=<64+ character secret>
SESSION_SECRET=<32+ character secret>

# Optional
SENTRY_DSN=
REDIS_URL=
```

### Build Process

```bash
# Build steps
npm ci                    # Install dependencies
npm run build            # Build application
npx prisma generate      # Generate Prisma client
npx prisma migrate deploy # Run migrations
npm run start            # Start server
```

### Health Check Endpoint

```typescript
// Implement health check
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});
```

## Deployment Platforms

### Vercel (Frontend)

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Railway/Render (Backend)

```yaml
# railway.toml or render.yaml
services:
  - type: web
    name: api
    env: node
    buildCommand: npm ci && npm run build && npx prisma generate
    startCommand: npm run start
    healthCheckPath: /api/health
```

### Docker

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npx prisma generate

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
EXPOSE 3000
CMD ["npm", "run", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=app
      - POSTGRES_PASSWORD=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Post-Deployment Verification

```markdown
## Post-Deployment Checklist

### Immediate Checks
- [ ] Health endpoint returns 200
- [ ] Application logs show successful startup
- [ ] Database connections established
- [ ] No errors in error tracking

### Functional Checks
- [ ] User can register/login
- [ ] Core features working
- [ ] API endpoints responding
- [ ] WebSocket connections (if applicable)

### Performance Checks
- [ ] Response times acceptable (<200ms p99)
- [ ] No memory leaks
- [ ] Database queries performant
- [ ] CDN working (if applicable)

### Monitoring
- [ ] Metrics flowing
- [ ] Alerts configured
- [ ] Logs accessible
- [ ] Dashboard updated
```

## Rollback Procedure

```markdown
## Rollback Steps

### 1. Identify Issue
- Check error logs
- Identify affected users
- Determine root cause

### 2. Decision
- Hotfix possible? -> Implement fix
- Need rollback? -> Continue

### 3. Rollback
# Database (if migration issues)
npx prisma migrate rollback

# Application
# Redeploy previous version via CI/CD
# or: git revert HEAD && git push

### 4. Verify
- Health check passes
- Core functionality works
- Errors stopped

### 5. Post-Mortem
- Document what happened
- Identify prevention measures
- Update processes
```

## Monitoring Setup

```typescript
// Sentry integration
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

## Output Format

```markdown
## Deployment Report

**Version**: v1.2.0
**Date**: 2024-01-15 14:30 UTC
**Environment**: Production
**Deployer**: [Name]

### Pre-Deployment
| Check | Status |
|-------|--------|
| Tests | PASS |
| Build | PASS |
| Security | PASS |
| Migrations | PASS |

### Deployment
- Platform: [Railway/Vercel/etc]
- Duration: 3m 42s
- Status: SUCCESS

### Post-Deployment
| Check | Status |
|-------|--------|
| Health | PASS |
| Functionality | PASS |
| Performance | PASS |
| Monitoring | PASS |

### Notes
- [Any observations]

### Rollback Required
- No
```
