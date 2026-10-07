# Code Style Rules - TypeScript/React/Express

These rules apply to all TypeScript/JavaScript code in the project. Follow these guidelines for consistent, maintainable code.

## General Principles

1. **Readability over cleverness** - Code should be easy to understand
2. **Consistency** - Follow existing patterns in the codebase
3. **Type Safety** - Leverage TypeScript's type system fully
4. **Immutability** - Prefer immutable data structures and operations
5. **Functional Patterns** - Use functional programming where appropriate

---

## Formatting

### Automatic Formatting
Always use Prettier for consistent formatting:
```bash
npm run format           # Format all files
npm run format:check     # CI check
```

### Line Length
- Maximum 100 characters (configurable in Prettier)
- Break long lines at logical points

### Indentation
- 2 spaces for indentation
- No tabs

---

## Naming Conventions

### Files and Directories
```
# Good - kebab-case for files, PascalCase for components
src/components/user-profile/UserProfile.tsx
src/hooks/use-auth.ts
src/services/user-service.ts
src/utils/format-date.ts
src/types/user.types.ts

# Bad
src/components/UserProfile/userProfile.tsx
src/hooks/UseAuth.ts
```

### Variables and Functions
```typescript
// Good - camelCase for variables and functions
const userName = 'John';
const isAuthenticated = true;
const maxRetryCount = 3;

function getUserById(id: string) { ... }
const fetchUserData = async () => { ... }

// Bad - unclear or wrong case
const user_name = 'John';
const ISAUTHENTICATED = true;
function GetUser() { ... }
```

### Types and Interfaces
```typescript
// Good - PascalCase for types/interfaces, suffix with Type if needed
interface User {
  id: string;
  email: string;
  name: string;
}

type UserRole = 'admin' | 'user' | 'guest';

interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

// Props interfaces
interface UserProfileProps {
  user: User;
  onUpdate: (user: User) => void;
}

// Bad
interface user { ... }
type userRole = ...
```

### Constants
```typescript
// Good - SCREAMING_SNAKE_CASE for true constants
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://api.example.com';
const DEFAULT_PAGE_SIZE = 20;

// Environment-based config (camelCase is fine)
const config = {
  apiUrl: process.env.API_URL,
  port: process.env.PORT || 3000,
};
```

### React Components
```typescript
// Good - PascalCase for components
function UserProfile({ user }: UserProfileProps) { ... }
const UserList: React.FC<UserListProps> = ({ users }) => { ... }

// Good - use* prefix for hooks
function useAuth() { ... }
function useLocalStorage(key: string) { ... }

// Good - handle* or on* prefix for event handlers
const handleSubmit = () => { ... }
const handleUserClick = (user: User) => { ... }
```

---

## TypeScript Best Practices

### Use Strict Types
```typescript
// Good - explicit types for function parameters and returns
function createUser(input: CreateUserInput): Promise<User> {
  // implementation
}

// Good - use generics for reusable types
function useQuery<T>(url: string): { data: T | null; loading: boolean } {
  // implementation
}

// Bad - avoid 'any'
function processData(data: any): any { ... }

// If you must use any, prefer 'unknown' and narrow types
function processUnknown(data: unknown): void {
  if (typeof data === 'string') {
    // data is now string
  }
}
```

### Prefer Interface for Objects
```typescript
// Good - interface for object shapes
interface User {
  id: string;
  email: string;
  createdAt: Date;
}

// Good - type for unions, primitives, and complex types
type UserRole = 'admin' | 'user' | 'guest';
type Nullable<T> = T | null;
type AsyncResult<T> = Promise<{ data: T } | { error: Error }>;

// Good - extend interfaces
interface AdminUser extends User {
  permissions: string[];
}
```

### Use Enums Sparingly
```typescript
// Prefer const objects or union types over enums
// Good - union type (better tree-shaking)
type Status = 'pending' | 'active' | 'completed';

// Good - const object for values with runtime access
const STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const;

type Status = typeof STATUS[keyof typeof STATUS];

// Avoid - TypeScript enums (unless needed for specific reasons)
enum Status {
  PENDING,
  ACTIVE,
  COMPLETED
}
```

---

## React Patterns

### Functional Components
```typescript
// Good - function declaration or arrow function
function UserProfile({ user, onUpdate }: UserProfileProps) {
  return (
    <div className="user-profile">
      <h1>{user.name}</h1>
    </div>
  );
}

// Also good - arrow function with type annotation
const UserList: React.FC<UserListProps> = ({ users }) => {
  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
};
```

### Hooks Usage
```typescript
// Good - hooks at top level, in consistent order
function UserProfile({ userId }: { userId: string }) {
  // 1. State hooks
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FormData | null>(null);

  // 2. Context hooks
  const { user: currentUser } = useAuth();

  // 3. Ref hooks
  const inputRef = useRef<HTMLInputElement>(null);

  // 4. Custom hooks
  const { data: user, loading, error } = useUser(userId);

  // 5. Effect hooks
  useEffect(() => {
    if (user) {
      setFormData(user);
    }
  }, [user]);

  // 6. Callback hooks
  const handleSubmit = useCallback(() => {
    // implementation
  }, [formData]);

  // 7. Memo hooks
  const displayName = useMemo(() => {
    return `${user?.firstName} ${user?.lastName}`;
  }, [user]);

  // Rest of component
}
```

### Custom Hooks
```typescript
// Good - extract reusable logic into custom hooks
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error('Error saving to localStorage', error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}
```

### Props Destructuring
```typescript
// Good - destructure in parameters with defaults
function Button({
  children,
  variant = 'primary',
  disabled = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

---

## Express Patterns

### Route Organization
```typescript
// Good - routes/users.routes.ts
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema';

const router = Router();
const controller = new UserController();

router.get('/', authenticate, controller.list);
router.get('/:id', authenticate, controller.getById);
router.post('/', authenticate, validate(createUserSchema), controller.create);
router.put('/:id', authenticate, validate(updateUserSchema), controller.update);
router.delete('/:id', authenticate, controller.delete);

export default router;
```

### Controller Pattern
```typescript
// Good - controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';

export class UserController {
  private userService = new UserService();

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await this.userService.findAll();
      res.json({ data: users });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.userService.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.userService.create(req.body);
      res.status(201).json({ data: user });
    } catch (error) {
      next(error);
    }
  };
}
```

### Service Layer
```typescript
// Good - services/user.service.ts
import { prisma } from '../lib/prisma';
import { CreateUserInput, UpdateUserInput } from '../types/user.types';
import { hashPassword } from '../utils/auth';

export class UserService {
  async findAll() {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });
  }

  async create(input: CreateUserInput) {
    const hashedPassword = await hashPassword(input.password);
    return prisma.user.create({
      data: {
        ...input,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, input: UpdateUserInput) {
    return prisma.user.update({
      where: { id },
      data: input,
    });
  }

  async delete(id: string) {
    return prisma.user.delete({ where: { id } });
  }
}
```

---

## Error Handling

### Express Error Handling
```typescript
// Good - custom error classes
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

// Good - error middleware
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
    });
  }

  console.error('Unexpected error:', error);
  res.status(500).json({
    error: 'An unexpected error occurred',
  });
}
```

### React Error Boundaries
```typescript
// Good - error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Log to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>Something went wrong.</div>;
    }
    return this.props.children;
  }
}
```

---

## Async Patterns

### Async/Await
```typescript
// Good - use async/await
async function fetchUserData(userId: string): Promise<User> {
  const response = await fetch(`/api/users/${userId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.status}`);
  }

  return response.json();
}

// Good - parallel execution when independent
async function loadDashboard(userId: string) {
  const [user, posts, notifications] = await Promise.all([
    fetchUser(userId),
    fetchPosts(userId),
    fetchNotifications(userId),
  ]);

  return { user, posts, notifications };
}

// Good - error handling in async functions
async function createUser(input: CreateUserInput): Promise<Result<User>> {
  try {
    const user = await userService.create(input);
    return { success: true, data: user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

## Avoid

### Magic Numbers and Strings
```typescript
// Bad
if (user.role === 'admin') { ... }
if (retries > 3) { ... }

// Good
const ROLES = { ADMIN: 'admin', USER: 'user' } as const;
const MAX_RETRIES = 3;

if (user.role === ROLES.ADMIN) { ... }
if (retries > MAX_RETRIES) { ... }
```

### Deeply Nested Code
```typescript
// Bad
function processUser(user: User | null) {
  if (user) {
    if (user.isActive) {
      if (user.hasPermission) {
        return doSomething(user);
      }
    }
  }
  return null;
}

// Good - early returns
function processUser(user: User | null) {
  if (!user) return null;
  if (!user.isActive) return null;
  if (!user.hasPermission) return null;

  return doSomething(user);
}
```

### Commented-Out Code
```typescript
// Bad - delete, don't comment
function calculateTotal(items: Item[]) {
  // const total = items.map(i => i.price).reduce((a, b) => a + b, 0);
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Good - just working code
function calculateTotal(items: Item[]) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

### Overusing `any`
```typescript
// Bad
function process(data: any): any {
  return data.map((item: any) => item.value);
}

// Good - use proper types
function process(data: DataItem[]): number[] {
  return data.map((item) => item.value);
}

// If type is truly unknown, use unknown and narrow
function processUnknown(data: unknown): number[] {
  if (!Array.isArray(data)) {
    throw new Error('Expected array');
  }
  return data.map((item) => {
    if (typeof item?.value !== 'number') {
      throw new Error('Expected number value');
    }
    return item.value;
  });
}
```

---

## Code Organization

### Module Structure
```typescript
// Good - organize imports and exports
// 1. External imports
import { useState, useEffect } from 'react';
import { z } from 'zod';

// 2. Internal imports
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { userService } from '@/services/user.service';

// 3. Types
import type { User } from '@/types/user.types';

// 4. Constants
const DEFAULT_PAGE_SIZE = 20;

// 5. Types/Interfaces specific to this file
interface UserListProps {
  initialUsers?: User[];
}

// 6. Component/Function
export function UserList({ initialUsers = [] }: UserListProps) {
  // Implementation
}

// 7. Helper functions (at bottom or in separate file)
function formatUserName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
```

### Barrel Exports
```typescript
// Good - components/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Modal } from './Modal';

// Usage
import { Button, Input, Modal } from '@/components';
```

### Separation of Concerns
```typescript
// Good - separate logic from presentation
// hooks/useUserList.ts
export function useUserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { users, loading, error };
}

// components/UserList.tsx
export function UserList() {
  const { users, loading, error } = useUserList();

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return (
    <ul>
      {users.map((user) => (
        <UserListItem key={user.id} user={user} />
      ))}
    </ul>
  );
}
```
