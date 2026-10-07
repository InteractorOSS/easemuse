# Testing Rules - Jest/React Testing Library/Supertest

Guidelines for writing effective, maintainable tests in JavaScript/TypeScript.

## Coverage Requirements

| Metric | Minimum | Target |
|--------|---------|--------|
| Overall Coverage | 80% | 90% |
| Critical Paths | 100% | 100% |
| New Code | 80% | 95% |
| Branch Coverage | 70% | 85% |

### Critical Paths (100% Required)
- Authentication/authorization
- Payment processing
- Data mutations
- Security-sensitive operations
- Core business logic (services)

---

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific file
npm test -- src/services/__tests__/user.service.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="create user"

# Run in watch mode
npm test -- --watch

# Run only changed tests
npm test -- --onlyChanged

# Run E2E tests
npm run test:e2e

# Run with verbose output
npm test -- --verbose
```

---

## Test Types

### Unit Tests
**What to test:**
- Service functions
- Utility functions
- React hooks
- Pure business logic
- Validators

**Characteristics:**
- Fast (< 50ms per test)
- No external dependencies (mock everything)
- Test through public APIs

### Integration Tests
**What to test:**
- API endpoints
- Database operations
- Component with context/providers
- External API interactions (mocked)

**Characteristics:**
- May use test database
- Test realistic scenarios
- Mock external services

### E2E Tests (Playwright/Cypress)
**What to test:**
- Critical user journeys
- Authentication flows
- Core business processes

**Characteristics:**
- Slower to execute
- Run against full application
- Test from user perspective

---

## Test Structure

### Naming Convention
```typescript
// Good - descriptive test names
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a user with valid data', () => {
      // test implementation
    });

    it('should throw ValidationError when email is invalid', () => {
      // test implementation
    });

    it('should throw ConflictError when email already exists', () => {
      // test implementation
    });
  });

  describe('findById', () => {
    it('should return user when found', () => {
      // test implementation
    });

    it('should return null when user not found', () => {
      // test implementation
    });
  });
});
```

### AAA Pattern (Arrange, Act, Assert)
```typescript
it('should create a user with valid data', async () => {
  // Arrange - Set up test data
  const input = {
    email: 'test@example.com',
    name: 'Test User',
    password: 'securePassword123',
  };

  // Act - Execute the code
  const result = await userService.create(input);

  // Assert - Verify results
  expect(result).toMatchObject({
    email: 'test@example.com',
    name: 'Test User',
  });
  expect(result.id).toBeDefined();
  expect(result.password).toBeUndefined(); // Password not returned
});
```

---

## Jest Configuration

### Basic Setup
```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.spec.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
};

export default config;
```

### Test Setup File
```typescript
// src/tests/setup.ts
import { prisma } from '@/lib/prisma';

// Clear database before each test
beforeEach(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;

  for (const { tablename } of tables) {
    if (tablename !== '_prisma_migrations') {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`);
    }
  }
});

// Disconnect after all tests
afterAll(async () => {
  await prisma.$disconnect();
});
```

---

## Testing React Components

### React Testing Library Setup
```typescript
// src/tests/test-utils.tsx
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';

interface WrapperProps {
  children: React.ReactNode;
}

function AllProviders({ children }: WrapperProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {children}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react';
export { customRender as render };
```

### Component Testing
```typescript
import { render, screen, fireEvent, waitFor } from '@/tests/test-utils';
import userEvent from '@testing-library/user-event';
import { UserProfile } from './UserProfile';

describe('UserProfile', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
  };

  const mockOnUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders user information', () => {
    render(<UserProfile user={mockUser} onUpdate={mockOnUpdate} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('enables edit mode when edit button is clicked', async () => {
    const user = userEvent.setup();
    render(<UserProfile user={mockUser} onUpdate={mockOnUpdate} />);

    await user.click(screen.getByRole('button', { name: /edit/i }));

    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();
  });

  it('calls onUpdate when form is submitted', async () => {
    const user = userEvent.setup();
    render(<UserProfile user={mockUser} onUpdate={mockOnUpdate} />);

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.clear(screen.getByRole('textbox', { name: /name/i }));
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Jane Doe');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith({
        ...mockUser,
        name: 'Jane Doe',
      });
    });
  });

  it('displays validation error for empty name', async () => {
    const user = userEvent.setup();
    render(<UserProfile user={mockUser} onUpdate={mockOnUpdate} />);

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.clear(screen.getByRole('textbox', { name: /name/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });
});
```

### Hook Testing
```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { authService } from '@/services/auth.service';

jest.mock('@/services/auth.service');

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns initial unauthenticated state', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('authenticates user on login', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    (authService.login as jest.Mock).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@example.com', 'password');
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('handles login error', async () => {
    (authService.login as jest.Mock).mockRejectedValue(
      new Error('Invalid credentials')
    );

    const { result } = renderHook(() => useAuth());

    await expect(
      act(async () => {
        await result.current.login('test@example.com', 'wrong');
      })
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
```

---

## Testing Express APIs

### API Testing with Supertest
```typescript
import request from 'supertest';
import { app } from '../app';
import { prisma } from '@/lib/prisma';
import { createTestUser, generateAuthToken } from '@/tests/helpers';

describe('POST /api/users', () => {
  let authToken: string;

  beforeAll(async () => {
    const admin = await createTestUser({ role: 'admin' });
    authToken = generateAuthToken(admin);
  });

  describe('with valid data', () => {
    it('should create user and return 201', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'new@example.com',
          name: 'New User',
          password: 'securePassword123',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        email: 'new@example.com',
        name: 'New User',
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.password).toBeUndefined();
    });
  });

  describe('with invalid data', () => {
    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test' })
        .expect(400);

      expect(response.body.error).toContain('email');
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invalid-email',
          name: 'Test',
          password: 'securePassword123',
        })
        .expect(400);

      expect(response.body.error).toContain('email');
    });
  });

  describe('without authentication', () => {
    it('should return 401', async () => {
      await request(app)
        .post('/api/users')
        .send({
          email: 'test@example.com',
          name: 'Test',
          password: 'securePassword123',
        })
        .expect(401);
    });
  });
});
```

---

## Testing Services

### Service Unit Tests
```typescript
import { UserService } from './user.service';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError } from '@/errors';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

describe('UserService', () => {
  const userService = new UserService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const validInput = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'securePassword123',
    };

    it('should create user with hashed password', async () => {
      const mockUser = { id: '1', ...validInput, password: 'hashed' };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await userService.create(validInput);

      expect(result.email).toBe(validInput.email);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: validInput.email,
          password: expect.not.stringMatching(validInput.password),
        }),
      });
    });

    it('should throw ConflictError if email exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: '1' });

      await expect(userService.create(validInput)).rejects.toThrow(
        ConflictError
      );
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: '1', email: 'test@example.com' };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await userService.findById('1');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundError when not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(userService.findById('999')).rejects.toThrow(NotFoundError);
    });
  });
});
```

---

## Test Fixtures and Factories

### Factory Pattern
```typescript
// src/tests/factories/user.factory.ts
import { faker } from '@faker-js/faker';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/utils/auth';

interface CreateUserOptions {
  email?: string;
  name?: string;
  password?: string;
  role?: 'admin' | 'user';
}

export async function createUser(options: CreateUserOptions = {}) {
  const password = options.password || 'testPassword123';
  const hashedPassword = await hashPassword(password);

  return prisma.user.create({
    data: {
      email: options.email || faker.internet.email(),
      name: options.name || faker.person.fullName(),
      password: hashedPassword,
      role: options.role || 'user',
    },
  });
}

export function generateUserData(overrides: Partial<CreateUserOptions> = {}) {
  return {
    email: faker.internet.email(),
    name: faker.person.fullName(),
    password: 'testPassword123',
    ...overrides,
  };
}
```

### Using Factories
```typescript
import { createUser, generateUserData } from '@/tests/factories/user.factory';

describe('UserService', () => {
  it('should update user name', async () => {
    // Arrange
    const user = await createUser({ name: 'Original Name' });

    // Act
    const updated = await userService.update(user.id, { name: 'New Name' });

    // Assert
    expect(updated.name).toBe('New Name');
  });

  it('should validate user data', () => {
    const userData = generateUserData({ email: 'invalid' });

    expect(() => validateUserData(userData)).toThrow();
  });
});
```

---

## Mocking

### Mocking Modules
```typescript
// Mock entire module
jest.mock('@/services/email.service');

// Mock with implementation
jest.mock('@/services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock specific function
import { sendEmail } from '@/services/email.service';
jest.mocked(sendEmail).mockResolvedValue({ success: true });
```

### Mocking External APIs
```typescript
import nock from 'nock';

describe('ExternalApiService', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it('should fetch data from external API', async () => {
    nock('https://api.external.com')
      .get('/users/1')
      .reply(200, { id: '1', name: 'External User' });

    const result = await externalApiService.getUser('1');

    expect(result).toEqual({ id: '1', name: 'External User' });
  });

  it('should handle API errors', async () => {
    nock('https://api.external.com')
      .get('/users/1')
      .reply(500, { error: 'Internal Server Error' });

    await expect(externalApiService.getUser('1')).rejects.toThrow();
  });
});
```

---

## Anti-Patterns to Avoid

### Don't Test Implementation Details
```typescript
// Bad - testing internal state
it('should set loading state', () => {
  const { result } = renderHook(() => useUsers());
  expect(result.current._internalLoading).toBe(true); // Don't test internal state
});

// Good - test observable behavior
it('should show loading indicator while fetching', () => {
  render(<UserList />);
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
```

### Don't Depend on Test Order
```typescript
// Bad - tests share state
let user: User;

it('creates user', async () => {
  user = await createUser();
});

it('updates user', async () => {
  // Fails if previous test didn't run
  await updateUser(user.id, { name: 'New' });
});

// Good - each test is independent
it('creates user', async () => {
  const user = await createUser();
  expect(user).toBeDefined();
});

it('updates user', async () => {
  const user = await createUser(); // Create fresh user
  const updated = await updateUser(user.id, { name: 'New' });
  expect(updated.name).toBe('New');
});
```

### Don't Over-Mock
```typescript
// Bad - mocking everything
it('creates user', () => {
  jest.mock('./validation');
  jest.mock('./database');
  jest.mock('./password');
  // Test is now meaningless
});

// Good - mock only external boundaries
it('creates user', async () => {
  // Real validation, real business logic
  // Only mock: database, external APIs
  const user = await userService.create(validInput);
  expect(user.email).toBe(validInput.email);
});
```

### Test Behavior, Not Implementation
```typescript
// Bad - testing how something works
it('should call map and filter', () => {
  const mapSpy = jest.spyOn(Array.prototype, 'map');
  processUsers(users);
  expect(mapSpy).toHaveBeenCalled();
});

// Good - testing what something does
it('should return only active users with formatted names', () => {
  const users = [
    { name: 'john', active: true },
    { name: 'jane', active: false },
  ];
  const result = processUsers(users);
  expect(result).toEqual([{ name: 'John', active: true }]);
});
```
