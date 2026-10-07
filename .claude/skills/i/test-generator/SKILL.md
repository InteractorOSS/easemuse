---
name: test-generator
description: Generate test scaffolds, suggest test cases, and analyze coverage gaps. Use when implementing new features, fixing bugs, or improving test coverage.
---

# Test Generator Skill

Generate comprehensive test suites following TDD principles and best practices.

## When to Use

- Before implementing new features (TDD)
- When fixing bugs (write regression test first)
- To improve test coverage
- When refactoring existing code
- During code review to identify missing tests

## Instructions

### Step 1: Analyze the Code

Before generating tests:
1. Understand the function/component purpose
2. Identify inputs and outputs
3. Find edge cases
4. Determine error conditions
5. Check for side effects

### Step 2: Test Categories

Generate tests for each category:

#### Unit Tests
- Individual functions
- Pure logic
- Utilities
- Validators
- Custom hooks

#### Integration Tests
- API endpoints
- Database operations
- Service interactions
- External APIs (mocked)

#### E2E Tests
- Critical user journeys
- Authentication flows
- Core business processes

### Step 3: Test Structure

Use AAA (Arrange-Act-Assert) pattern:

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange - Set up test data and conditions
      const input = { ... };

      // Act - Execute the code being tested
      const result = methodName(input);

      // Assert - Verify the result
      expect(result).toBe(expected);
    });
  });
});
```

### Step 4: Generate Test Cases

For each function, generate tests for:

#### Happy Path
- Normal input produces expected output
- Common use cases work correctly

#### Edge Cases
- Empty inputs
- Boundary values (min, max)
- Null/undefined handling
- Large inputs

#### Error Cases
- Invalid inputs
- Missing required fields
- Type mismatches
- Permission errors

#### State Changes
- Before and after states
- Side effects verified
- Cleanup performed

## Templates

### Service Unit Test (Jest)

```typescript
import { UserService } from './user.service';
import { prisma } from '@/lib/prisma';
import { NotFoundError, ConflictError } from '@/errors';

jest.mock('@/lib/prisma');

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

    it('should create user with valid data', async () => {
      const mockUser = { id: '1', ...validInput };
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await userService.create(validInput);

      expect(result).toMatchObject({
        email: validInput.email,
        name: validInput.name,
      });
    });

    it('should throw ConflictError when email exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: '1' });

      await expect(userService.create(validInput)).rejects.toThrow(ConflictError);
    });

    it('should hash password before storing', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: '1' });

      await userService.create(validInput);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          password: expect.not.stringMatching(validInput.password),
        }),
      });
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: '1', email: 'test@example.com' };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await userService.findById('1');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundError when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(userService.findById('999')).rejects.toThrow(NotFoundError);
    });
  });
});
```

### React Component Test (Testing Library)

```typescript
import { render, screen, waitFor } from '@testing-library/react';
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
      expect(mockOnUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Doe' })
      );
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

  it('cancels edit mode without saving', async () => {
    const user = userEvent.setup();
    render(<UserProfile user={mockUser} onUpdate={mockOnUpdate} />);

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Changed');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(mockOnUpdate).not.toHaveBeenCalled();
  });
});
```

### API Endpoint Test (Supertest)

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

  afterEach(async () => {
    await prisma.user.deleteMany();
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

  describe('with duplicate email', () => {
    it('should return 409 conflict', async () => {
      await createTestUser({ email: 'existing@example.com' });

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'existing@example.com',
          name: 'Test',
          password: 'securePassword123',
        })
        .expect(409);

      expect(response.body.error).toContain('exists');
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

### Custom Hook Test

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { authService } from '@/services/auth.service';

jest.mock('@/services/auth.service');

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('returns initial unauthenticated state', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('authenticates user on login', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    (authService.login as jest.Mock).mockResolvedValue({
      user: mockUser,
      token: 'mock-token',
    });

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

  it('logs out user', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    (authService.login as jest.Mock).mockResolvedValue({
      user: mockUser,
      token: 'mock-token',
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@example.com', 'password');
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
```

## Output Format

When generating tests:

```markdown
## Test Generation Summary

**Target**: `src/services/user.service.ts`
**Test File**: `src/services/__tests__/user.service.test.ts`

### Tests Generated

| Category | Count | Description |
|----------|-------|-------------|
| Happy Path | 3 | Normal operation tests |
| Edge Cases | 5 | Boundary and empty input tests |
| Error Cases | 4 | Invalid input and error handling |
| Integration | 2 | Database interaction tests |

### Coverage Estimate
- Statements: ~95%
- Branches: ~90%
- Functions: 100%

### Recommended Additional Tests
- [ ] Test concurrent access
- [ ] Test timeout handling
- [ ] Test rate limiting
```

## Best Practices

1. **One assertion per test** (when practical)
2. **Descriptive test names** - Should read like documentation
3. **Independent tests** - No test should depend on another
4. **Fast tests** - Mock external dependencies
5. **Deterministic** - Same result every time
6. **Test behavior, not implementation**
