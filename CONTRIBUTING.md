# Contributing to React/Express Product Development Template

Thank you for your interest in contributing to this template! This document provides guidelines for contributing.

## Ways to Contribute

### Reporting Issues

If you find a bug or have a suggestion:

1. Check existing issues to avoid duplicates
2. Create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Environment details (Node version, OS, etc.)

### Suggesting Improvements

We welcome suggestions for:

- New skills or commands
- Documentation improvements
- Better patterns or practices
- Platform-specific configurations
- Workflow optimizations

Create an issue with the `enhancement` label.

### Contributing Code

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow existing code style
   - Update documentation as needed
   - Add tests if applicable

4. **Test your changes**
   ```bash
   # Validate the template works
   ./scripts/setup/init-project.sh test-project web
   ```

5. **Commit with clear messages**
   ```bash
   git commit -m "Add: description of what you added"
   # or
   git commit -m "Fix: description of what you fixed"
   ```

6. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Guidelines

### Skills and Commands

When adding new skills or commands:

- Follow the existing file structure
- Include clear documentation
- Provide usage examples
- Test with Claude Code

### Documentation

- Use clear, concise language
- Include code examples where helpful
- Keep formatting consistent
- Update the main README if needed

### Code Style

- Use 2-space indentation
- Follow existing patterns
- Keep files focused and modular
- Comment complex logic

## Template Feedback

If you're using this template for a project, we'd love to hear:

- What worked well
- What was confusing
- What's missing
- Suggestions for improvement

Use `docs/templates/template-feedback.md` to track your feedback, then share it with us via an issue or PR.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Focus on the work, not the person

## Questions?

Open an issue with the `question` label if you need clarification on anything.

Thank you for contributing!
