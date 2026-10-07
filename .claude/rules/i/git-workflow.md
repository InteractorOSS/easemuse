# Git Workflow Rules

Standards for version control, branching, and collaboration.

## Branch Strategy

### Branch Types

| Type | Pattern | Purpose | Base | Merge To |
|------|---------|---------|------|----------|
| `main` | `main` | Production-ready code | - | - |
| `develop` | `develop` | Integration branch | `main` | `main` |
| `feature` | `feature/<name>` | New features | `develop` | `develop` |
| `bugfix` | `bugfix/<name>` | Bug fixes | `develop` | `develop` |
| `hotfix` | `hotfix/<name>` | Production fixes | `main` | `main` & `develop` |
| `release` | `release/<version>` | Release preparation | `develop` | `main` & `develop` |

### Branch Naming

```bash
# Good - descriptive and follows pattern
feature/user-authentication
feature/ABC-123-add-payment-processing
bugfix/fix-login-redirect
hotfix/security-patch-xss
release/v1.2.0

# Bad - unclear or wrong format
feature/new-stuff
john/my-changes
fix
temp
```

---

## Commit Messages

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code restructuring |
| `perf` | Performance improvement |
| `test` | Adding/updating tests |
| `build` | Build system changes |
| `ci` | CI configuration |
| `chore` | Maintenance tasks |
| `revert` | Reverting changes |

### Rules

1. **Subject line**: Max 72 characters, imperative mood
2. **Body**: Explain what and why (not how)
3. **Footer**: Reference issues, breaking changes

### Examples

```bash
# Good - clear and descriptive
feat(auth): add password reset functionality

Implement password reset flow with email verification.
Users can request a reset link that expires after 24 hours.

- Add password reset request endpoint
- Implement email token generation
- Create reset confirmation page

Closes #123

# Good - simple fix
fix(api): handle null user in profile endpoint

# Good - with breaking change
feat(api)!: change user endpoint response format

BREAKING CHANGE: The /api/users endpoint now returns
a paginated response instead of an array.

Before: [{ id: 1, name: "John" }]
After: { data: [{ id: 1, name: "John" }], total: 1 }

# Bad - vague
update code
fix bug
wip
```

---

## Pull Request Guidelines

### PR Title
- Follow commit message format
- Summarize all changes in the PR

### PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Change 1
- Change 2

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Screenshots (if applicable)
[Add screenshots here]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
```

### PR Size Guidelines

| Size | Lines Changed | Review Time |
|------|---------------|-------------|
| Small | < 200 | < 30 min |
| Medium | 200-500 | 30-60 min |
| Large | 500-1000 | 1-2 hours |
| Too Large | > 1000 | Split into smaller PRs |

---

## Code Review

### Author Responsibilities
- Self-review before requesting review
- Respond to feedback promptly
- Explain complex changes
- Keep PR focused and small

### Reviewer Responsibilities
- Review within 24 hours
- Provide constructive feedback
- Approve when satisfied
- Use appropriate feedback types

### Feedback Types

```markdown
# Blocking (must be addressed)
🔴 **[Required]**: This SQL query is vulnerable to injection.
Please use parameterized queries.

# Suggestion (should consider)
🟡 **[Suggestion]**: Consider extracting this into a separate function
for better reusability.

# Nitpick (optional)
🟢 **[Nit]**: Typo in variable name: `recieve` → `receive`

# Question (for understanding)
❓ **[Question]**: What happens if the user doesn't have an email?

# Praise (positive feedback)
👍 **[Nice]**: Great use of early returns here, much more readable!
```

---

## Merge Strategy

### When to Use Each Strategy

| Strategy | When to Use |
|----------|-------------|
| **Squash merge** | Feature branches with messy history |
| **Merge commit** | Release branches, preserving history |
| **Rebase** | Keeping linear history (small PRs) |

### Merge Checklist
- [ ] All CI checks pass
- [ ] Required approvals obtained
- [ ] Conflicts resolved
- [ ] Branch is up to date with target
- [ ] PR description is complete

---

## Git Commands Reference

### Daily Workflow

```bash
# Start new feature
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# Work on feature
git add .
git commit -m "feat: add new functionality"

# Keep up to date
git fetch origin
git rebase origin/develop

# Push changes
git push origin feature/my-feature

# After PR merged
git checkout develop
git pull origin develop
git branch -d feature/my-feature
```

### Common Operations

```bash
# Amend last commit (before push)
git commit --amend -m "new message"

# Interactive rebase (clean up history)
git rebase -i HEAD~3

# Stash changes
git stash
git stash pop

# View history
git log --oneline -n 10
git log --graph --oneline --all

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard local changes
git checkout -- <file>
git restore <file>  # Git 2.23+
```

### Handling Conflicts

```bash
# During merge/rebase
git status                    # See conflicting files
# Edit files to resolve conflicts
git add <resolved-files>
git rebase --continue         # or git merge --continue

# Abort if needed
git rebase --abort
git merge --abort
```

---

## Protected Branches

### `main` Branch Rules
- No direct pushes
- Require PR with at least 1 approval
- Require passing CI checks
- Require up-to-date branch
- No force pushes

### `develop` Branch Rules
- No direct pushes
- Require PR with approval
- Require passing CI checks

---

## Release Process

### Version Numbering (Semantic Versioning)

```
MAJOR.MINOR.PATCH

1.0.0 - Initial release
1.0.1 - Patch: bug fixes
1.1.0 - Minor: new features (backward compatible)
2.0.0 - Major: breaking changes
```

### Release Workflow

```bash
# Create release branch
git checkout develop
git pull origin develop
git checkout -b release/v1.2.0

# Update version
npm version minor  # or major, patch

# Update CHANGELOG
# ... edit CHANGELOG.md ...

git add .
git commit -m "chore: prepare release v1.2.0"

# Merge to main
git checkout main
git merge release/v1.2.0

# Tag release
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin main --tags

# Merge back to develop
git checkout develop
git merge release/v1.2.0
git push origin develop

# Delete release branch
git branch -d release/v1.2.0
```

---

## Git Hooks

### Pre-commit
```bash
#!/bin/sh
# Run linter
npm run lint

# Run type check
npm run type-check

# Prevent commits to main
branch=$(git symbolic-ref HEAD 2>/dev/null | cut -d"/" -f 3)
if [ "$branch" = "main" ]; then
  echo "Direct commits to main are not allowed"
  exit 1
fi
```

### Commit-msg
```bash
#!/bin/sh
# Validate commit message format
commit_msg=$(cat "$1")
pattern="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,72}$"

if ! echo "$commit_msg" | grep -qE "$pattern"; then
  echo "Invalid commit message format"
  echo "Expected: <type>(<scope>): <subject>"
  exit 1
fi
```
