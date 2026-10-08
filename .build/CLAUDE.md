# EaseMuse — Claude Code instructions

This project is managed via Interactor. Task and project state is stored as files in `.build/`.

## Vision — read this first

`.build/vision.md` is the product's north star. Before drafting plans, proposing features, or implementing changes, **read it** and check that the work serves it. If a proposed change doesn't fit the vision, flag the mismatch before doing the work — don't quietly drift.

## How to work with project files

- **Vision**: `.build/vision.md` — singleton; body is the long-form vision prose
- **Tasks**: `.build/tasks/<slug>.md` — edit `status`, `priority`, `assignee` in frontmatter; body is the description
- **Phases**: `.build/phases/<slug>.md` — edit status, dates, and description
- **Sprints**: `.build/sprints/<slug>.md` — edit goal, status, dates

## Committing changes

Commit as you normally would. The webhook will pick up changes and sync them to Interactor.
To prevent a sync loop, Interactor's own commits include `[interactor-sync]` in the message — do **not** use that marker in your own commits.

## Reading project state

When asked about tasks, phases, or project status, read the files in `.build/` directly rather than relying on memory.
