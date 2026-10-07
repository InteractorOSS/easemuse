# Backend Project Configuration - Express/Node.js

## Technology Stack

This is an Express.js backend project. Apply the following technology-specific guidance.

### Language/Runtime
- **TypeScript 5.x** on Node.js 20+

### Framework
- **Express.js 4.x**

### Database
- **PostgreSQL** with Prisma ORM

### Key Libraries
- **Prisma** - Type-safe database client
- **Zod** - Runtime validation
- **bcrypt** - Password hashing
- **jsonwebtoken** - JWT authentication
- **helmet** - Security headers
- **cors** - CORS middleware
- **BullMQ** - Background job processing
- **Nodemailer** - Email delivery

---

## Project Structure

```
src/
├── app.ts                      # Express app setup
├── server.ts                   # Server entry point
├── config/
│   ├── index.ts                # Configuration loader
│   └── database.ts             # Database configuration
├── routes/
│   ├── index.ts                # Route aggregator
│   ├── auth.routes.ts          # Auth endpoints
│   └── users.routes.ts         # User endpoints
├── controllers/
│   ├── auth.controller.ts      # Auth request handlers
│   └── users.controller.ts     # User request handlers
├── services/
│   ├── auth.service.ts         # Auth business logic
│   └── users.service.ts        # User business logic
├── middleware/
│   ├── auth.middleware.ts      # JWT verification
│   ├── error.middleware.ts     # Error handling
│   └── validation.middleware.ts # Request validation
├── lib/
│   └── prisma.ts               # Prisma client instance
├── types/
│   ├── index.ts                # Shared types
│   └── express.d.ts            # Express type extensions
├── utils/
│   ├── hash.ts                 # Password utilities
│   └── jwt.ts                  # JWT utilities
└── workers/
    └── email.worker.ts         # Background email worker

prisma/
├── schema.prisma               # Database schema
├── migrations/                 # Database migrations
└── seed.ts                     # Database seeding

tests/
├── unit/                       # Unit tests
├── integration/                # Integration tests
└── setup.ts                    # Test setup
```

---

## Commands

```bash
# Development
npm run dev                         # Start with nodemon
npm run build                       # Build TypeScript
npm start                           # Start production server

# Database
npx prisma generate                 # Generate Prisma Client
npx prisma migrate dev              # Run migrations (development)
npx prisma migrate deploy           # Run migrations (production)
npx prisma migrate dev --name <name> # Create new migration
npx prisma db push                  # Push schema changes (no migration)
npx prisma studio                   # Open Prisma Studio GUI
npx prisma db seed                  # Run database seeding

# Testing
npm test                            # Run all tests
npm run test:watch                  # Watch mode
npm run test:coverage               # With coverage report
npm run test:integration            # Integration tests only

# Code Quality
npm run lint                        # Run ESLint
npm run lint:fix                    # Auto-fix lint issues
npm run format                      # Format with Prettier
npm run typecheck                   # TypeScript check
```

---

## Service Layer Pattern

### Service Structure
```typescript
// src/services/users.service.ts
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/utils/hash';
import type { CreateUserInput, UpdateUserInput, User } from '@/types';

export class UserService {
  /**
   * Returns all users.
   */
  async list(): Promise<User[]> {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Gets a single user by ID.
   */
  async getById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Gets a user by email.
   */
  async getByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Creates a new user.
   */
  async create(input: CreateUserInput): Promise<User> {
    const hashedPassword = await hashPassword(input.password);

    return prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        password: hashedPassword,
        role: input.role ?? 'USER',
      },
    });
  }

  /**
   * Updates a user.
   */
  async update(id: string, input: UpdateUserInput): Promise<User> {
    const data: Record<string, unknown> = { ...input };

    if (input.password) {
      data.password = await hashPassword(input.password);
    }

    return prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Deletes a user.
   */
  async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }
}

export const userService = new UserService();
```

### Prisma Schema Pattern
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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
  id     String  @id @default(cuid())
  bio    String?
  avatar String?
  userId String  @unique
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([authorId])
}

enum Role {
  USER
  ADMIN
}
```

---

## Controller Pattern

### Controller Structure
```typescript
// src/controllers/users.controller.ts
import { Request, Response, NextFunction } from 'express';
import { userService } from '@/services/users.service';
import { CreateUserSchema, UpdateUserSchema } from '@/schemas/user.schema';
import { NotFoundError, ConflictError } from '@/utils/errors';

export class UserController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await userService.list();
      res.json({ data: users });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.getById(req.params.id);

      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = CreateUserSchema.parse(req.body);

      const existing = await userService.getByEmail(input.email);
      if (existing) {
        throw new ConflictError('Email already exists');
      }

      const user = await userService.create(input);
      res.status(201).json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = UpdateUserSchema.parse(req.body);
      const user = await userService.update(req.params.id, input);
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await userService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
```

### Route Definition
```typescript
// src/routes/users.routes.ts
import { Router } from 'express';
import { userController } from '@/controllers/users.controller';
import { authenticate } from '@/middleware/auth.middleware';
import { authorize } from '@/middleware/authorize.middleware';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN'), userController.list);
router.get('/:id', userController.getById);
router.post('/', authorize('ADMIN'), userController.create);
router.put('/:id', userController.update);
router.delete('/:id', authorize('ADMIN'), userController.delete);

export { router as userRoutes };
```

---

## Middleware Patterns

### Authentication Middleware
```typescript
// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@/utils/jwt';
import { UnauthorizedError } from '@/utils/errors';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authentication token');
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    req.user = payload;
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid token'));
  }
}
```

### Authorization Middleware
```typescript
// src/middleware/authorize.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '@/utils/errors';

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError('Not authenticated'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}
```

### Error Handling Middleware
```typescript
// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/utils/errors';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Zod validation error
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.flatten().fieldErrors,
    });
  }

  // Custom application error
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
  }

  // Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({
      error: 'Database error',
      code: 'DATABASE_ERROR',
    });
  }

  // Unknown error
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    code: 'SERVER_ERROR',
  });
}
```

---

## Background Jobs (BullMQ)

### Worker Pattern
```typescript
// src/workers/email.worker.ts
import { Worker, Job } from 'bullmq';
import { sendEmail } from '@/lib/mailer';
import { connection } from '@/lib/redis';

interface EmailJobData {
  type: 'welcome' | 'password_reset' | 'notification';
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

const emailWorker = new Worker<EmailJobData>(
  'emails',
  async (job: Job<EmailJobData>) => {
    const { to, subject, template, data } = job.data;

    await sendEmail({
      to,
      subject,
      template,
      data,
    });

    return { sent: true };
  },
  {
    connection,
    concurrency: 5,
  }
);

emailWorker.on('completed', (job) => {
  console.log(`Email job ${job.id} completed`);
});

emailWorker.on('failed', (job, error) => {
  console.error(`Email job ${job?.id} failed:`, error);
});

export { emailWorker };
```

### Enqueue Jobs
```typescript
// src/lib/queue.ts
import { Queue } from 'bullmq';
import { connection } from '@/lib/redis';

export const emailQueue = new Queue('emails', { connection });

// Usage in service
await emailQueue.add('welcome', {
  type: 'welcome',
  to: user.email,
  subject: 'Welcome!',
  template: 'welcome',
  data: { name: user.name },
});

// Delayed job
await emailQueue.add('reminder', data, {
  delay: 1000 * 60 * 60, // 1 hour
});
```

---

## Testing

### Integration Test
```typescript
// tests/integration/users.test.ts
import request from 'supertest';
import { app } from '@/app';
import { prisma } from '@/lib/prisma';
import { createTestUser, generateAuthToken } from '../helpers';

describe('Users API', () => {
  let authToken: string;
  let testUser: { id: string; email: string };

  beforeAll(async () => {
    testUser = await createTestUser();
    authToken = generateAuthToken(testUser);
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
  });

  describe('GET /api/users/:id', () => {
    it('returns user by ID', async () => {
      const response = await request(app)
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(testUser.email);
    });

    it('returns 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/users/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/users', () => {
    it('creates user with valid data', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'new@example.com',
          name: 'New User',
          password: 'securePassword123',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.email).toBe('new@example.com');
    });

    it('returns 400 for invalid data', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
```

### Test Helpers
```typescript
// tests/helpers.ts
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/utils/hash';
import { signToken } from '@/utils/jwt';

export async function createTestUser(overrides = {}) {
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      password: await hashPassword('testPassword123'),
      role: 'USER',
      ...overrides,
    },
  });
}

export function generateAuthToken(user: { id: string; role: string }) {
  return signToken({ userId: user.id, role: user.role });
}
```

---

## Performance

### Database Queries
```typescript
// Use select to limit fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    name: true,
  },
});

// Use include for relations
const userWithPosts = await prisma.user.findUnique({
  where: { id },
  include: { posts: true },
});

// Pagination
const users = await prisma.user.findMany({
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { createdAt: 'desc' },
});

// Add indexes in schema
// @@index([email])
// @@index([authorId, createdAt])
```

### Caching
```typescript
// src/lib/cache.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 3600
): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}
```

---

## Security

### Helmet Configuration
```typescript
// src/app.ts
import helmet from 'helmet';

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
  },
}));
```

### Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
});

app.use('/api/', limiter);

// Stricter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

app.use('/api/auth/login', authLimiter);
```

### Input Validation
```typescript
// src/schemas/user.schema.ts
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(12).max(72),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(12).max(72).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
```

---

## Health Checks

```typescript
// src/routes/health.routes.ts
import { Router, Request, Response } from 'express';
import { prisma } from '@/lib/prisma';

const router = Router();

router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/health/ready', async (req: Request, res: Response) => {
  const checks: Record<string, string> = {};

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'error',
    checks,
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRoutes };
```

---

## Deployment

### Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
EXPOSE 3000
CMD ["npm", "run", "start"]
```

### Environment Variables
```bash
# Required
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=your-64-character-secret-key

# Optional
PORT=3000
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=https://yourdomain.com
```
