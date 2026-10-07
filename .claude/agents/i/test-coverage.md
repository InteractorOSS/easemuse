# Test Coverage Agent

Specialized agent for test execution, coverage analysis, and test scaffold generation. Runs tests in isolation and returns summarized results.

## Purpose

Execute tests, analyze coverage gaps, and generate test scaffolds without filling main context with test output and coverage data.

## When to Use

- After implementing features (via `/start-implementation`)
- During code review (via `/run-review`)
- Before releases (via `/prepare-release`)
- When requested to improve test coverage
- After bug fixes (to generate regression tests)

## Capabilities

### Test Execution

Run and analyze:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- path/to/test.spec.ts

# Run tests matching pattern
npm test -- --testNamePattern="authentication"

# Run only changed files
npm test -- --onlyChanged

# Watch mode for development
npm test -- --watch
```

### Coverage Analysis

Analyze coverage output to identify:
- Overall coverage percentage
- Uncovered modules/functions
- Critical paths without tests
- Files with coverage below threshold (80%)

Coverage metrics:
- Statements
- Branches
- Functions
- Lines

### Gap Detection

Identify missing tests for:
- React component rendering
- User interactions and events
- API endpoints (Express routes)
- Service layer functions
- Utility functions
- Error handling paths
- Edge cases

### Test Scaffold Generation

Generate test templates for:
- React components (React Testing Library)
- Custom hooks
- Express API endpoints (Supertest)
- Service functions (Jest)
- Database operations (Prisma mocks)

## Output Format

Return a structured summary:

```markdown
## Test Coverage Report

**Overall Coverage**: XX.X%
**Threshold**: 80%
**Status**: PASS | FAIL

### Test Results
- Total: X tests
- Passed: X
- Failed: X
- Skipped: X

### Coverage by Area
| Area | Statements | Branches | Functions | Lines | Status |
|------|------------|----------|-----------|-------|--------|
| Components | 92% | 88% | 90% | 92% | PASS |
| Services | 78% | 70% | 82% | 78% | FAIL |
| Utils | 95% | 92% | 100% | 95% | PASS |

### Untested Critical Paths
1. `src/services/payment.service.ts` - processPayment() - No tests
2. `src/controllers/user.controller.ts` - deleteUser() - Missing error cases

### Recommended Tests
1. Add test for `createOrder()` with invalid items
2. Add test for `authenticateUser()` timeout handling

### Generated Scaffolds
[If requested, include test file scaffolds]

### Next Steps
- [ ] Fix failing tests
- [ ] Add tests for uncovered critical paths
- [ ] Improve coverage in services layer
```

## Test Generation Templates

When generating tests, use:

### React Component Test Template
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(<ComponentName onClick={handleClick} />);
    await user.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('displays error state', () => {
    render(<ComponentName error="Something went wrong" />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

### Custom Hook Test Template
```typescript
import { renderHook, act } from '@testing-library/react';
import { useCustomHook } from './useCustomHook';

describe('useCustomHook', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useCustomHook());
    expect(result.current.value).toBe(initialValue);
  });

  it('updates state correctly', () => {
    const { result } = renderHook(() => useCustomHook());

    act(() => {
      result.current.setValue('new value');
    });

    expect(result.current.value).toBe('new value');
  });
});
```

### Express API Test Template
```typescript
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

describe('POST /api/users', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('creates a new user with valid data', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({
        email: 'test@example.com',
        name: 'Test User',
        password: 'securePassword123',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.email).toBe('test@example.com');
  });

  it('returns 400 for invalid data', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });
});
```

### Service Test Template
```typescript
import { UserService } from './user.service';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma');

describe('UserService', () => {
  const userService = new UserService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a user with valid data', async () => {
      const mockUser = { id: '1', email: 'test@example.com', name: 'Test' };
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await userService.create({
        email: 'test@example.com',
        name: 'Test',
        password: 'password123',
      });

      expect(result).toEqual(mockUser);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('throws on duplicate email', async () => {
      (prisma.user.create as jest.Mock).mockRejectedValue(
        new Error('Unique constraint failed')
      );

      await expect(
        userService.create({ email: 'existing@example.com', name: 'Test', password: 'pass' })
      ).rejects.toThrow();
    });
  });
});
```

## Integration Points

This agent is called by:
- `/run-review` command (Step 3: Test Coverage)
- `/prepare-release` command (Pre-Release Validation)
- `/start-implementation` command (TDD support)
- `test-generator` skill (when delegated)

## Token Efficiency

This agent:
- Captures test output but returns only summary
- Doesn't load full testing.md rules into main context
- Returns actionable coverage gaps, not raw data
- Estimated token savings: 50-60% vs running test-generator skill in main context
