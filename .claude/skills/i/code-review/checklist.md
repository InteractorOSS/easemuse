# Code Review Checklist

Use this checklist when reviewing code changes.

## Code Quality

### Naming & Readability
- [ ] Variables and functions have clear, descriptive names
- [ ] No single-letter variables (except loop counters)
- [ ] No abbreviations or cryptic names
- [ ] Code is self-documenting

### Structure & Organization
- [ ] Functions follow single responsibility principle
- [ ] Files are under 300 lines
- [ ] No unnecessary code duplication (DRY)
- [ ] Proper module organization
- [ ] Imports are organized and minimal

### TypeScript
- [ ] No `any` types without justification
- [ ] Proper interface definitions for objects
- [ ] Type aliases for complex types
- [ ] Proper use of generics
- [ ] Strict mode enabled

## React Specific

### Components
- [ ] Functional components used
- [ ] Props properly typed
- [ ] No unnecessary re-renders
- [ ] Proper key props for lists
- [ ] Components are reasonably sized

### Hooks
- [ ] Hooks at top level only
- [ ] Dependencies arrays correct
- [ ] useCallback/useMemo used appropriately
- [ ] Custom hooks for reusable logic
- [ ] No infinite loops in effects

### State Management
- [ ] State kept close to where used
- [ ] Lifting state done appropriately
- [ ] No prop drilling (use context or state management)
- [ ] Proper handling of async state

## Express Specific

### Architecture
- [ ] Controllers are thin (no business logic)
- [ ] Business logic in services
- [ ] Data access through repositories/Prisma
- [ ] Proper separation of concerns

### Routes
- [ ] RESTful conventions followed
- [ ] Proper HTTP status codes
- [ ] Consistent response format
- [ ] Validation middleware present

### Middleware
- [ ] Authentication middleware on protected routes
- [ ] Error handling middleware present
- [ ] Request validation middleware
- [ ] Logging middleware configured

## Security

### Authentication & Authorization
- [ ] All protected routes require auth
- [ ] Authorization checks on resource access
- [ ] No sensitive data in responses
- [ ] Session/token handling secure

### Input/Output
- [ ] All user input validated
- [ ] Parameterized queries (Prisma)
- [ ] Output properly encoded
- [ ] File uploads validated

### Secrets
- [ ] No hardcoded credentials
- [ ] Environment variables for secrets
- [ ] .env files in .gitignore
- [ ] No secrets in logs

## Testing

### Coverage
- [ ] New code has tests
- [ ] Critical paths have 100% coverage
- [ ] Edge cases tested
- [ ] Error cases tested

### Quality
- [ ] Tests are independent
- [ ] No test interdependencies
- [ ] Meaningful assertions
- [ ] Clear test names
- [ ] Mocks used appropriately

## Performance

### General
- [ ] No obvious O(n²) operations
- [ ] Async operations handled properly
- [ ] No blocking operations
- [ ] Caching where appropriate

### Database
- [ ] Efficient queries
- [ ] Proper indexes used
- [ ] No N+1 query problems
- [ ] Pagination implemented

### Frontend
- [ ] Large lists virtualized
- [ ] Images optimized
- [ ] Code splitting used
- [ ] Bundle size reasonable

## Documentation

### Code Comments
- [ ] Complex logic explained
- [ ] No obvious comments
- [ ] TODO/FIXME have tickets
- [ ] JSDoc for public APIs

### External Docs
- [ ] README updated
- [ ] API docs current
- [ ] CHANGELOG updated
- [ ] ADRs for decisions

## Review Outcome

- [ ] **APPROVE** - No issues or only minor suggestions
- [ ] **REQUEST CHANGES** - Critical issues must be addressed
- [ ] **COMMENT** - Questions or discussion needed
