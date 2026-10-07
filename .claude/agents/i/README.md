# Project Agents

Specialized agents for delegating heavy operations to reduce main context usage.

## Available Agents

| Agent | Purpose | Token Savings | Use Case |
|-------|---------|---------------|----------|
| `security-auditor` | Security scanning & OWASP checks | 60-70% | Pre-release, code review |
| `test-coverage` | Test execution & coverage analysis | 50-60% | Implementation, review |
| `release-validator` | Comprehensive pre-release validation | 70-80% | Before releases |
| `architecture-planner` | Architecture design & ADRs | 50-60% | Planning phase |
| `visual-tester` | Playwright visual UI/UX testing | 80%+ | UI changes, design review |

## Usage Pattern

These agents are designed to be spawned via the Task tool instead of running heavy skills in the main context.

### Example: Using release-validator

Instead of running all validation commands in main context:

```
# OLD (fills context with output)
User: Run pre-release validation
Claude: [runs npm test, npm run lint, etc. - all output in context]
```

Use the agent:

```
# NEW (delegated, returns summary only)
User: Run pre-release validation
Claude: [spawns release-validator agent]
Agent returns: Structured pass/fail summary only
```

### When to Delegate vs Run Inline

**Delegate to Agent** (context-heavy operations):
- Running multiple npm commands with verbose output
- Security scanning with detailed analysis
- Test execution with coverage reports
- Architecture design with multiple diagrams

**Run Inline** (quick operations):
- Single file edits
- Quick questions about code
- Simple validations
- User interaction required

## Integration with Existing Structure

### Commands -> Agents

| Command | Delegates To |
|---------|-------------|
| `/prepare-release` | `release-validator`, `security-auditor` |
| `/run-review` | `security-auditor`, `test-coverage`, `visual-tester` |
| `/start-planning` | `architecture-planner` |
| `/start-implementation` | `test-coverage` (for TDD) |
| UI changes | `visual-tester` (Playwright visual tests) |

### Skills -> Agents

| Skill | Can Delegate To |
|-------|-----------------|
| `security-audit` | `security-auditor` agent |
| `test-generator` | `test-coverage` agent |
| `validator` | `release-validator` agent |
| `architecture-planner` | `architecture-planner` agent |
| `ui-design` (visual testing) | `visual-tester` agent |

### Skills That Stay Inline

These skills need context awareness and should NOT be delegated:

- `code-review` - Needs to see code being reviewed
- `ui-design` (patterns) - Needs to apply patterns while writing code
- `doc-generator` - Can use `documentation-manager` (built-in agent)

### Visual Testing Workflow

When making UI changes:

```
1. Write UI code (ui-design skill in context)
2. Delegate to visual-tester agent for Playwright verification
3. Review screenshot results
4. Fix issues and re-test
```

The `visual-tester` agent uses Playwright (`--play` flag) to:
- Capture responsive screenshots (mobile, tablet, desktop)
- Test light/dark mode rendering
- Verify AI chat widget functionality
- Check for overflow and layout issues

## Token Efficiency Strategy

1. **Phase Commands** run in main context (need user interaction)
2. **Heavy validation** delegates to agents (returns summaries)
3. **Code generation** uses built-in agents when parallel
4. **Rules** loaded only when relevant (not preloaded)

## Built-in Agents (from Task tool)

Also available:
- `validation-gates` - General testing/validation
- `documentation-manager` - Documentation updates
- `design-review` - UI/UX consistency checks
- `Explore` - Codebase exploration
