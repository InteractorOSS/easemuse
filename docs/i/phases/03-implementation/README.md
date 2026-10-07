# Phase 3: Implementation

## Overview

The Implementation phase is where the actual coding happens. This phase focuses on writing quality code following established standards and best practices.

## Objectives

- Implement features according to architecture
- Write clean, maintainable code
- Follow TDD practices where appropriate
- Maintain code quality through reviews
- Document as you go

## Duration

Varies based on project scope and sprint length.

---

## Prerequisites

Before starting implementation:
- [ ] Architecture design approved
- [ ] Development environment set up
- [ ] Tasks created and prioritized
- [ ] Code style guidelines reviewed
- [ ] Git workflow understood

---

## Process

### Daily Workflow

1. **Start of Day**
   - Review assigned tasks
   - Check for blockers
   - Sync with team (standup)

2. **During Development**
   - Write tests first (when appropriate)
   - Implement in small increments
   - Commit frequently
   - Request code reviews

3. **End of Day**
   - Push changes
   - Update task status
   - Document blockers

### Development Cycle

```
┌─────────────────────────────────────────────┐
│                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│  │  Plan   │───►│  Code   │───►│  Test   │ │
│  └─────────┘    └─────────┘    └─────────┘ │
│       ▲                             │       │
│       │                             │       │
│       │         ┌─────────┐         │       │
│       └─────────│ Review  │◄────────┘       │
│                 └─────────┘                 │
│                      │                      │
│                      ▼                      │
│                 ┌─────────┐                 │
│                 │  Merge  │                 │
│                 └─────────┘                 │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Guidelines

### Before Coding

1. **Understand the Task**
   - Review requirements and acceptance criteria
   - Check related architecture decisions
   - Identify dependencies

2. **Plan Your Approach**
   - Break down into smaller steps
   - Identify test cases
   - Consider edge cases

3. **Set Up**
   - Create feature branch
   - Update local environment
   - Run existing tests

### While Coding

1. **Follow Standards**
   - Use consistent naming
   - Follow code style guide
   - Write self-documenting code

2. **Write Tests**
   - Test as you go
   - Cover happy path and edge cases
   - Aim for meaningful coverage

3. **Commit Often**
   - Make atomic commits
   - Write clear commit messages
   - Push regularly

4. **Stay Focused**
   - One task at a time
   - Avoid scope creep
   - Ask for help when stuck

### After Coding

1. **Self-Review**
   - Read through your changes
   - Run all tests
   - Check for common issues

2. **Create PR**
   - Write clear description
   - Link related issues
   - Request appropriate reviewers

3. **Address Feedback**
   - Respond to comments
   - Make requested changes
   - Re-request review when ready

---

## Checklist

### Task Start
- [ ] Task requirements understood
- [ ] Acceptance criteria clear
- [ ] Feature branch created
- [ ] Dependencies identified

### During Development
- [ ] Code follows style guide
- [ ] Tests written and passing
- [ ] No hardcoded values
- [ ] Errors handled appropriately
- [ ] Security considerations addressed

### Before PR
- [ ] Self-review completed
- [ ] All tests passing
- [ ] No lint errors
- [ ] Documentation updated
- [ ] Commit history clean

### After PR
- [ ] Review feedback addressed
- [ ] CI checks passing
- [ ] Approved by reviewer
- [ ] Branch merged
- [ ] Task status updated

---

## AI Collaboration Tips

### Effective Prompts

```
"Help me implement [feature] based on this architecture:
[Paste relevant architecture details]"
```

```
"Write tests for this function:
[Paste function code]
Cover: happy path, edge cases, error handling"
```

```
"Review this code for:
- Security issues
- Performance problems
- Code style violations
[Paste code]"
```

```
"Refactor this code to improve [specific aspect]:
[Paste code]"
```

```
"Add error handling to this function:
[Paste function]
Consider: network errors, validation, timeout"
```

### Best Practices with AI

**DO:**
- Provide context before asking for code
- Review generated code carefully
- Ask for explanations when unclear
- Request tests for generated code
- Break complex tasks into smaller requests

**DON'T:**
- Accept code without understanding it
- Skip testing generated code
- Ignore security implications
- Use AI for sensitive/proprietary logic
- Copy-paste without adaptation

---

## Common Patterns

### Error Handling
```javascript
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new OperationError('Failed to complete operation', { cause: error });
}
```

### Input Validation
```javascript
function createUser(input: CreateUserInput): User {
  const validated = CreateUserSchema.parse(input);
  // Proceed with validated data
}
```

### Async Operations
```javascript
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

---

## Templates

- [Coding Standards](./coding-standards.md)
- [AI Collaboration Guide](./ai-collaboration-guide.md)

---

## Related Rules

- `.claude/rules/code-style.md` - Code formatting
- `.claude/rules/testing.md` - Testing requirements
- `.claude/rules/security.md` - Security practices
- `.claude/rules/git-workflow.md` - Git conventions

---

## Related Skills

- `code-review` - Review code quality
- `test-generator` - Generate test scaffolds
- `doc-generator` - Update documentation
