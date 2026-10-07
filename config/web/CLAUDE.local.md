# Web Project Configuration

## Technology Stack

This is a web application project. Apply the following technology-specific guidance.

### Frontend Framework
- **React 18+** with TypeScript
- Vite for development and builds

### Build Tools
- **Vite** / Next.js / Remix

### Styling
- **Tailwind CSS** / CSS Modules / Styled Components / Emotion

### State Management
- **React Query** for server state
- **Zustand** / Redux Toolkit for client state

---

## Project Structure

```
src/
├── app/                 # App entry, routing
├── components/
│   ├── ui/              # Base components (Button, Input, Modal)
│   ├── layout/          # Layout components (Header, Footer, Sidebar)
│   └── features/        # Feature-specific components
├── hooks/               # Custom React hooks
├── lib/                 # Utility libraries, configurations
├── services/            # API services, external integrations
├── stores/              # State management
├── styles/              # Global styles, themes
├── types/               # TypeScript type definitions
└── utils/               # Utility functions
```

---

## Commands

```bash
# Development
npm run dev              # Start development server (usually port 5173)
npm run build            # Production build
npm run preview          # Preview production build
npm run start            # Start production server

# Testing
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
npm run test:e2e         # End-to-end tests

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix lint issues
npm run format           # Format with Prettier
npm run typecheck        # TypeScript check
```

---

## Component Guidelines

### Structure
```tsx
// ComponentName.tsx
import { useState } from 'react';
import type { ComponentNameProps } from './types';

export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  const [state, setState] = useState(initialValue);

  return (
    <div className="container">
      {/* Component content */}
    </div>
  );
}
```

### Best Practices
- Use functional components with hooks
- Co-locate tests with components (`Component.test.tsx`)
- Use TypeScript for props and state
- Implement accessibility (ARIA labels, keyboard nav)
- Use semantic HTML elements
- Keep components focused and small

---

## State Management

### Server State (API Data)
```tsx
// Use React Query for server state
import { useQuery, useMutation } from '@tanstack/react-query';

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });
}
```

### Client State (UI State)
```tsx
// Use local state or lightweight stores
import { create } from 'zustand';

const useUIStore = create((set) => ({
  isMenuOpen: false,
  toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
}));
```

---

## API Integration

### API Service Pattern
```typescript
// services/api/users.ts
import { api } from '@/lib/api';

export const usersApi = {
  getAll: () => api.get<User[]>('/users'),
  getById: (id: string) => api.get<User>(`/users/${id}`),
  create: (data: CreateUserInput) => api.post<User>('/users', data),
  update: (id: string, data: UpdateUserInput) => api.put<User>(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};
```

---

## Performance Considerations

### Code Splitting
```tsx
// Lazy load routes and heavy components
const Dashboard = lazy(() => import('./pages/Dashboard'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
```

### Image Optimization
```tsx
// Use optimized image components
<img
  src="/hero.jpg"
  alt="Hero"
  loading="lazy"
  width={1200}
  height={600}
/>
```

### Memoization
```tsx
// Memoize expensive computations
const expensiveResult = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);

// Memoize callbacks passed to children
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);
```

---

## Testing

### Component Testing
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('calls onClick when clicked', async () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### E2E Testing
```typescript
// Playwright example
import { test, expect } from '@playwright/test';

test('user can complete checkout', async ({ page }) => {
  await page.goto('/products');
  await page.click('[data-testid="add-to-cart"]');
  await page.click('[data-testid="checkout"]');
  await expect(page.locator('h1')).toContainText('Order Confirmed');
});
```

---

## Security

### XSS Prevention
- React escapes by default
- Use `DOMPurify` for HTML content
- Avoid `dangerouslySetInnerHTML`

### Authentication
- Store tokens in httpOnly cookies (preferred)
- Use secure session management
- Implement CSRF protection

### CSP Headers
```javascript
// vite.config.ts or server config
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
  }
];
```

---

## Accessibility

### Checklist
- [ ] Semantic HTML elements used
- [ ] ARIA labels where needed
- [ ] Keyboard navigation works
- [ ] Focus states visible
- [ ] Color contrast sufficient (4.5:1)
- [ ] Alt text for images
- [ ] Form labels connected to inputs

### Tools
- axe DevTools browser extension
- Lighthouse accessibility audit
- WAVE accessibility checker
