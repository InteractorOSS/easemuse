# Coding Standards

## Overview

This document outlines the coding standards and best practices for the project. Following these standards ensures consistency, maintainability, and quality across the codebase.

---

## General Principles

### 1. Readability First
- Code is read more often than written
- Optimize for understanding, not cleverness
- Use meaningful names that explain purpose

### 2. Keep It Simple
- Solve the problem at hand, not hypothetical future problems
- Avoid premature optimization
- Prefer simple solutions over complex ones

### 3. Consistency
- Follow existing patterns in the codebase
- Use the same style throughout
- When in doubt, match surrounding code

### 4. Self-Documenting Code
- Code should explain itself through naming
- Comments explain "why", not "what"
- If code needs extensive comments, consider refactoring

---

## Code Organization

### File Structure
```
src/
├── components/          # UI components
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   ├── Button.styles.ts
│   │   └── index.ts
│   └── ...
├── services/           # Business logic
│   ├── user/
│   │   ├── userService.ts
│   │   ├── userService.test.ts
│   │   └── types.ts
│   └── ...
├── utils/              # Utility functions
├── types/              # Type definitions
├── constants/          # Constants and enums
└── config/             # Configuration
```

### File Naming
- Use kebab-case for file names: `user-service.ts`
- Match component name for React: `UserProfile.tsx`
- Test files: `*.test.ts` or `*.spec.ts`
- Type files: `types.ts` or `*.types.ts`

### Module Organization
```typescript
// 1. Imports (grouped and ordered)
// External packages
import React from 'react';
import { useQuery } from 'react-query';

// Internal modules
import { UserService } from '@/services/user';

// Relative imports
import { formatDate } from './utils';
import type { UserProps } from './types';

// 2. Types/Interfaces
interface ComponentProps {
  // ...
}

// 3. Constants
const DEFAULT_PAGE_SIZE = 20;

// 4. Component/Function
export function Component(props: ComponentProps) {
  // ...
}

// 5. Helpers (if needed)
function helperFunction() {
  // ...
}
```

---

## Functions

### Function Design
```typescript
// Good - small, focused, single responsibility
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letter');
  }

  return { valid: errors.length === 0, errors };
}

// Bad - too many responsibilities
function validateUser(user: any): boolean {
  // Validates email AND password AND name AND...
  // 50+ lines of validation
}
```

### Parameters
```typescript
// Good - use options object for multiple params
interface CreateUserOptions {
  email: string;
  name: string;
  role?: UserRole;
  sendWelcomeEmail?: boolean;
}

function createUser(options: CreateUserOptions): Promise<User> {
  const { email, name, role = 'user', sendWelcomeEmail = true } = options;
  // ...
}

// Bad - too many positional params
function createUser(
  email: string,
  name: string,
  role: string,
  sendEmail: boolean,
  department: string
): Promise<User> {
  // ...
}
```

### Return Values
```typescript
// Good - explicit return type
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Good - handle errors with Result type
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

function parseConfig(json: string): Result<Config> {
  try {
    const config = JSON.parse(json);
    return { success: true, data: config };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}
```

---

## Error Handling

### Use Specific Error Types
```typescript
class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`);
    this.name = 'NotFoundError';
  }
}

// Usage
throw new ValidationError('Invalid email format', 'email', 'INVALID_EMAIL');
throw new NotFoundError('User', userId);
```

### Handle Errors Appropriately
```typescript
// Good - specific handling
async function processOrder(order: Order): Promise<Result<void>> {
  try {
    await paymentService.charge(order);
    await inventoryService.reserve(order.items);
    await emailService.sendConfirmation(order);
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof PaymentError) {
      logger.warn('Payment failed', { orderId: order.id, error });
      return { success: false, error: new Error('Payment declined') };
    }
    if (error instanceof InventoryError) {
      logger.warn('Inventory issue', { orderId: order.id, error });
      return { success: false, error: new Error('Item out of stock') };
    }
    // Unexpected error - log and rethrow
    logger.error('Unexpected error processing order', { orderId: order.id, error });
    throw error;
  }
}
```

### Never Swallow Errors
```typescript
// Bad - silently failing
try {
  await sendEmail(user);
} catch (e) {
  // Silent failure - user never knows email failed
}

// Good - handle or propagate
try {
  await sendEmail(user);
} catch (error) {
  logger.error('Failed to send email', { userId: user.id, error });
  // Either retry, queue for later, or inform user
  await queueEmailRetry(user);
}
```

---

## Async Code

### Async/Await
```typescript
// Good - clear async flow
async function fetchUserWithOrders(userId: string): Promise<UserWithOrders> {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }

  const orders = await orderRepository.findByUserId(userId);

  return { ...user, orders };
}

// Good - parallel when independent
async function fetchDashboardData(userId: string): Promise<DashboardData> {
  const [user, orders, notifications] = await Promise.all([
    userRepository.findById(userId),
    orderRepository.findByUserId(userId),
    notificationRepository.findUnread(userId),
  ]);

  return { user, orders, notifications };
}
```

### Error Handling in Async
```typescript
// Good - proper error handling
async function fetchWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
  });

  return Promise.race([promise, timeout]);
}

// Usage
try {
  const data = await fetchWithTimeout(fetchData(), 5000);
} catch (error) {
  if (error.message === 'Request timeout') {
    // Handle timeout specifically
  }
  throw error;
}
```

---

## Testing

### Test Structure
```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const userData = { email: 'test@example.com', name: 'Test' };

      // Act
      const user = await userService.createUser(userData);

      // Assert
      expect(user.email).toBe(userData.email);
      expect(user.id).toBeDefined();
    });

    it('should throw ValidationError for invalid email', async () => {
      // Arrange
      const userData = { email: 'invalid', name: 'Test' };

      // Act & Assert
      await expect(userService.createUser(userData))
        .rejects.toThrow(ValidationError);
    });
  });
});
```

### Test Best Practices
- Test behavior, not implementation
- One assertion per test (when practical)
- Use descriptive test names
- Keep tests independent
- Mock external dependencies

---

## Security

### Never Trust Input
```typescript
// Validate all external input
const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).trim(),
  age: z.number().int().min(0).max(150).optional(),
});

function createUser(input: unknown): User {
  const validated = CreateUserSchema.parse(input);
  // Now safe to use validated data
}
```

### Protect Sensitive Data
```typescript
// Never log sensitive data
logger.info('User login', {
  userId: user.id,
  email: user.email,
  // password: user.password  // NEVER!
});

// Never expose in responses
function sanitizeUser(user: User): PublicUser {
  const { password, ssn, ...publicData } = user;
  return publicData;
}
```

---

## Code Review Checklist

Before submitting code:
- [ ] Code follows style guide
- [ ] Functions are small and focused
- [ ] Error handling is appropriate
- [ ] Tests cover new code
- [ ] No hardcoded values
- [ ] No security issues
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] No commented-out code
