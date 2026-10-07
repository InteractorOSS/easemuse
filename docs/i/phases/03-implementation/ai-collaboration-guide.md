# AI Collaboration Guide

## Overview

This guide provides best practices for working effectively with AI assistants like Claude during the implementation phase.

---

## Core Principles

### 1. AI as a Collaborator, Not a Replacement
- AI assists your thinking, doesn't replace it
- You are responsible for understanding and validating all code
- Use AI to accelerate, not to abdicate decision-making

### 2. Context is Key
- Provide relevant context for better results
- Share architecture decisions, constraints, and requirements
- Include existing code patterns when asking for new code

### 3. Iterate and Refine
- First responses may not be perfect
- Ask follow-up questions to improve
- Request modifications rather than starting over

---

## Effective Prompting

### Provide Context First

**Good Prompt:**
```
I'm implementing a user authentication system for a Node.js/Express API.
We're using:
- PostgreSQL with Prisma ORM
- JWT for tokens
- bcrypt for password hashing

Our architecture follows clean architecture with separate layers.

Help me implement the login endpoint that:
1. Validates email/password
2. Returns JWT token on success
3. Returns appropriate error messages on failure
```

**Bad Prompt:**
```
Write a login function
```

### Be Specific About Requirements

**Good Prompt:**
```
Create a React component for a user profile card that:
- Displays user avatar, name, and email
- Shows online/offline status with a colored indicator
- Has an edit button (only visible if isOwner prop is true)
- Uses TypeScript with proper types
- Follows our existing Button and Avatar component patterns
- Is accessible (ARIA labels, keyboard navigation)
```

**Bad Prompt:**
```
Make a user profile component
```

### Request Explanations

**Good Prompt:**
```
Explain why you chose this approach for handling concurrent requests.
What are the trade-offs compared to using a queue?
```

---

## Common Use Cases

### 1. Implementing Features

```
I need to implement [feature] for [context].

Requirements:
- [Requirement 1]
- [Requirement 2]

Constraints:
- Must work with existing [system/pattern]
- Performance requirement: [metric]

Here's the relevant existing code:
[paste code]

Please implement this following our existing patterns.
```

### 2. Writing Tests

```
Write tests for this function:
[paste function]

Cover:
1. Happy path with valid inputs
2. Edge cases (empty array, null values, boundary values)
3. Error cases (invalid inputs, thrown exceptions)

Use Jest with our existing test patterns.
```

### 3. Code Review

```
Review this code for:
1. Security vulnerabilities
2. Performance issues
3. Code style violations
4. Potential bugs

[paste code]

Provide specific suggestions with code examples.
```

### 4. Debugging

```
This code is causing [describe issue]:

[paste code]

Error message:
[paste error]

Expected behavior: [describe]
Actual behavior: [describe]

Help me identify the root cause and fix it.
```

### 5. Refactoring

```
Refactor this code to improve [specific aspect]:
- Better error handling
- Reduce complexity
- Improve testability
- Apply [specific pattern]

Current code:
[paste code]

Keep the same external interface.
```

---

## What AI Does Well

### Excellent For:
- **Boilerplate code** - Generating repetitive patterns
- **Test generation** - Creating test cases from specifications
- **Documentation** - Writing JSDoc, README sections
- **Code translation** - Converting between languages/frameworks
- **Pattern application** - Applying design patterns correctly
- **Bug identification** - Spotting common issues
- **Explanation** - Understanding unfamiliar code
- **Exploration** - Suggesting approaches to problems

### Use Cautiously For:
- **Complex business logic** - May miss domain nuances
- **Performance optimization** - Needs real profiling data
- **Security-critical code** - Requires expert review
- **Architecture decisions** - Context-dependent choices

### Not Recommended For:
- **Proprietary algorithms** - IP concerns
- **Production secrets** - Security risk
- **Compliance code** - Requires domain expertise
- **Final security review** - Use specialized tools

---

## Validation Checklist

Before using AI-generated code:

### Understanding
- [ ] I understand what this code does
- [ ] I can explain why each part is necessary
- [ ] I know how it integrates with existing code

### Correctness
- [ ] Logic is correct for all cases
- [ ] Edge cases are handled
- [ ] Error handling is appropriate

### Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] No obvious vulnerabilities
- [ ] Follows security guidelines

### Quality
- [ ] Follows code style guidelines
- [ ] Well-structured and readable
- [ ] No unnecessary complexity
- [ ] Appropriate naming

### Testing
- [ ] Unit tests cover the code
- [ ] Tests actually pass
- [ ] Edge cases tested

---

## Iterating with AI

### Refining Responses

**If the code is close but not quite right:**
```
This is good, but can you modify it to:
- Handle the case where [specific case]
- Use async/await instead of callbacks
- Add error handling for [specific error]
```

**If you need a different approach:**
```
This approach won't work because [reason].
Can you try an alternative that:
- [Alternative requirement 1]
- [Alternative requirement 2]
```

**If you need explanation:**
```
Can you explain:
1. Why you chose [approach] over [alternative]?
2. What happens when [edge case] occurs?
3. How does [specific part] work?
```

### Breaking Down Complex Tasks

Instead of asking for everything at once:

1. **First prompt:** "Design the interface for [feature]"
2. **Second prompt:** "Implement the core logic for [component]"
3. **Third prompt:** "Add error handling"
4. **Fourth prompt:** "Write tests for this"

---

## Common Pitfalls

### Avoid These Mistakes

1. **Accepting without understanding**
   - Always read and understand generated code
   - Ask for explanations if unclear

2. **Missing context**
   - Include relevant code, constraints, patterns
   - Mention frameworks and libraries in use

3. **Overly broad requests**
   - "Build me an app" → Too vague
   - Break into specific, focused requests

4. **Ignoring errors**
   - If AI code has errors, debug together
   - Don't just ask for "fixed" code

5. **Skipping tests**
   - Always test AI-generated code
   - Don't assume correctness

---

## Security Considerations

### Never Share:
- API keys or secrets
- Production credentials
- Customer data
- Proprietary algorithms
- Security-sensitive configurations

### Safe to Share:
- Public API patterns
- Generic code structures
- Sanitized example data
- Open-source library usage

---

## Quick Reference

### Prompt Templates

**Feature Implementation:**
```
Implement [feature] for [context] that [requirements].
Use [technologies]. Follow [patterns].
```

**Bug Fix:**
```
Fix [issue] in [code]. Error: [message].
Expected: [behavior]. Actual: [behavior].
```

**Code Review:**
```
Review [code] for [concerns].
Provide specific suggestions with examples.
```

**Refactoring:**
```
Refactor [code] to [goal].
Maintain [constraints]. Apply [patterns].
```

**Testing:**
```
Write tests for [code] covering [scenarios].
Use [framework] with [patterns].
```
