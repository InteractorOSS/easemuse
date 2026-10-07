# Security Rules

Security best practices that must be followed in all code.

## Core Principles

1. **Defense in Depth** - Multiple layers of security
2. **Least Privilege** - Minimum necessary permissions
3. **Fail Secure** - Default to denied state on errors
4. **Don't Trust Input** - Validate everything from external sources

---

## Authentication

### Password Requirements
```javascript
// Minimum requirements (NIST 800-63b aligned)
const PASSWORD_RULES = {
  minLength: 12,        // At least 12 characters
  maxLength: 128,       // Allow long passwords
  requireNumbers: false, // Not required per NIST
  requireSpecial: false, // Not required per NIST
  checkBreached: true,   // Check against breach databases
};

// Good - use established libraries
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### Session Management
```javascript
// Good practices
const SESSION_CONFIG = {
  name: 'sessionId',           // Generic name, not framework-specific
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,              // HTTPS only
    httpOnly: true,            // No JavaScript access
    sameSite: 'strict',        // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
};

// Regenerate session ID after authentication
app.post('/login', async (req, res) => {
  // Verify credentials...

  req.session.regenerate((err) => {
    req.session.userId = user.id;
    res.json({ success: true });
  });
});
```

### Token Security (JWT)
```javascript
// Good - secure JWT configuration
const JWT_OPTIONS = {
  algorithm: 'RS256',          // Use asymmetric keys
  expiresIn: '15m',            // Short-lived tokens
  issuer: 'your-app',
  audience: 'your-api',
};

// Always verify all claims
function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],     // Specify allowed algorithms
    issuer: 'your-app',
    audience: 'your-api',
  });
}

// Never store sensitive data in JWT
// Bad
{ userId: 1, email: 'user@example.com', password: '...' }

// Good
{ sub: 'user-uuid', type: 'access' }
```

---

## Authorization

### Check Permissions on Every Request
```javascript
// Good - middleware for authorization
function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasPermission(user, permission)) {
      // Log the attempt
      logger.warn('Authorization denied', {
        userId: user.id,
        permission,
        resource: req.path,
      });
      return res.status(403).json({ error: 'Permission denied' });
    }

    next();
  };
}

// Usage
app.delete('/users/:id', requirePermission('users:delete'), deleteUser);
```

### Resource-Level Authorization
```javascript
// Always check ownership/access to specific resources
async function getDocument(userId: string, documentId: string): Promise<Document> {
  const document = await documentRepository.findById(documentId);

  if (!document) {
    throw new NotFoundError('Document not found');
  }

  // Check access - don't just trust the user can access any document
  if (document.ownerId !== userId && !document.sharedWith.includes(userId)) {
    // Log potential unauthorized access attempt
    logger.warn('Unauthorized document access attempt', { userId, documentId });
    throw new ForbiddenError('Access denied');
  }

  return document;
}
```

---

## Input Validation

### Validate All External Input
```javascript
import { z } from 'zod';

// Define strict schemas
const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).trim(),
  age: z.number().int().min(0).max(150).optional(),
});

// Validate at the boundary
app.post('/users', async (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues,
    });
  }

  // result.data is typed and validated
  const user = await createUser(result.data);
  res.status(201).json(user);
});
```

### Sanitize Output
```javascript
// Prevent XSS - encode output
import { escape } from 'html-escaper';

function renderUserComment(comment: string): string {
  return `<div class="comment">${escape(comment)}</div>`;
}

// For rich text, use a sanitizer
import DOMPurify from 'dompurify';

function renderRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: [],
  });
}
```

---

## SQL Injection Prevention

### Always Use Parameterized Queries
```javascript
// NEVER do this
const query = `SELECT * FROM users WHERE email = '${email}'`;  // SQL INJECTION!

// Always use parameterized queries
// With raw SQL
const result = await db.query(
  'SELECT * FROM users WHERE email = $1 AND status = $2',
  [email, 'active']
);

// With ORM (Prisma)
const user = await prisma.user.findUnique({
  where: { email },
});

// With query builder (Knex)
const user = await knex('users')
  .where({ email })
  .first();
```

---

## Sensitive Data

### Environment Variables for Secrets
```javascript
// Good - secrets from environment
const config = {
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  stripe: {
    apiKey: process.env.STRIPE_SECRET_KEY,
  },
};

// Validate required secrets at startup
function validateConfig() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

### Never Log Sensitive Data
```javascript
// Bad - logging sensitive data
logger.info('User login', { email, password });  // Never log passwords!
logger.debug('API request', { headers: req.headers });  // May contain auth tokens

// Good - redact sensitive fields
logger.info('User login', { email, passwordProvided: !!password });
logger.debug('API request', {
  method: req.method,
  path: req.path,
  userId: req.user?.id,
});

// Use a logging library with redaction
const logger = pino({
  redact: ['password', 'token', 'authorization', 'cookie'],
});
```

### Encrypt Sensitive Data at Rest
```javascript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encrypt(plaintext: string): EncryptedData {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

function decrypt(data: EncryptedData): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(data.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'));

  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

---

## Security Headers

```javascript
// Required security headers
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HTTPS only
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Content Security Policy
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.example.com",
    "frame-ancestors 'none'",
  ].join('; '));

  next();
});
```

---

## Rate Limiting

```javascript
import rateLimit from 'express-rate-limit';

// General rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests per window
  message: { error: 'Too many requests' },
});

// Strict rate limit for sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                     // 5 attempts per hour
  message: { error: 'Too many login attempts' },
  skipSuccessfulRequests: true,
});

app.use('/api', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
```

---

## Dependency Security

```bash
# Regular security audits
npm audit                    # Check for vulnerabilities
npm audit fix               # Auto-fix where possible

# Use tools for continuous monitoring
npx snyk test               # Snyk security scan

# Keep dependencies updated
npx npm-check-updates -u    # Update package.json
npm update                  # Update within ranges
```

### Lockfile Integrity
- Always commit lockfiles (`package-lock.json`, `yarn.lock`)
- Use `npm ci` in CI/CD for reproducible builds
- Review dependency changes in PRs

---

## Error Handling

### Don't Leak Information in Errors
```javascript
// Bad - exposes internal details
app.use((err, req, res, next) => {
  res.status(500).json({
    error: err.message,
    stack: err.stack,
    query: err.query,  // SQL query leaked!
  });
});

// Good - generic error for clients, detailed logging
app.use((err, req, res, next) => {
  // Log full error internally
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.id,
    userId: req.user?.id,
  });

  // Return generic error to client
  res.status(500).json({
    error: 'An unexpected error occurred',
    requestId: req.id,
  });
});
```
