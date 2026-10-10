---
name: engine-create
description: "Create a new task in the current project from the terminal, then hand back its `#N` so you can immediately work it. This is the \"add a task to do X\" counterpart to the `engine-claim` step (which picks up an *existing* runnable task). It uses the same daemon token the rest of the local loop uses, so you — or a headless agent — can add work without opening the web UI."
---

# /engine-create

## Plain English

Create a new task in the current project from the terminal, then hand back its
`#N` so you can immediately work it. This is the "add a task to do X"
counterpart to the `engine-claim` step (which picks up an *existing* runnable task). It
uses the same daemon token the rest of the local loop uses, so you — or a
headless agent — can add work without opening the web UI.

The new task starts in the investigation phase, queued, beneath its goal.

## When to use this

Someone says something like "create a task to <do X>", "spin up a
task for <Y>", or "I need a task to track <Z>" — and wants it created right now,
locally, ready to `engine:work`. Map that to a single `engine:create` call with
the title (and optionally type/priority/description/goal) extracted from their
ask.

## Prerequisites (one-time)

- A **daemon token** in `.env.local` (`PM_DAEMON_TOKEN=pm_daemon_…`) — mint it in
  the web app under **Settings → Agent Tokens**.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both. The v2 create endpoint takes a
  daemon token or a browser session; a terminal call uses the token. The token
  owner becomes the task's creator, and creation is scoped to that owner's own
  projects.

## Steps

1. **FIRST, when attaching to a goal (`--goal <goalId>`), check the goal's
   existing open tasks — do NOT blindly mint a new implementation task.** A goal
   that already has open implementation work does not need a second one; claim the
   existing task instead of racing a duplicate the fleet will pick up (INCIDENT dup
   #1432). List the goal's tasks:
   ```bash
   ibuild engine status            # shows open work across the project's goals
   # or, for one goal:
   GET /api/v2/projects/:projectId/goals/:goalId/tasks
   ```
   If an **equivalent open implementation task** already exists, CLAIM it rather
   than creating a new one:
   ```bash
   ibuild engine work #<existingDisplayNumber>
   ```
   Only proceed to create if there is genuinely no equivalent open task.

2. **Create** the task:
   ```bash
   ibuild engine create "<title>"
   ```
   Optional flags:
   - `--type <task_type>` — one of `implementation` (default), `planning`,
     `discussion`, `error_analysis`, `feedback_review`.
   - `--priority <low|medium|high|urgent>`
   - `--desc "<longer context>"`
   - `--goal <goalId>` — attach the task to an existing goal.
   - `--allow-additional` — escape hatch for the duplicate guard below. Pass it
     ONLY when this is genuinely NEW parallel work under a goal that already has
     open implementation tasks.

   On success it prints the new `#<displayNumber>` + id and the exact
   `engine:work` command to run next. A missing title prints usage and exits 1.
   An invalid `--type`/`--priority` (or a non-member `--goal`/assignee) surfaces
   the server's `422` message.

   **Duplicate guard (dup #1432):** creating an `implementation` task under a
   `--goal` that ALREADY has ≥1 open implementation task is refused with a `409`,
   and `engine:create` prints the existing tasks verbatim (one line each:
   `#<displayNumber>  <title>  [<runtimeState>]  <id>`) plus a remediation hint,
   then exits non-zero. Read that list and `engine:work` the existing task — do not
   retry. If it really is new parallel work, re-run with `--allow-additional`.

3. **Work it** with the printed hint:
   ```bash
   ibuild engine work #<displayNumber>
   ```
   (See the `engine-claim` step for the claim → work → submit → report loop.)

## Notes

- This is a **capability**, not an autonomous sourcing flow — it creates one task
  from an explicit ask. Generating tasks from errors/feedback/discussions is a
  separate, larger slice.
- The endpoint is the same one the UI "New task" action uses
  (`POST /api/v2/projects/{projectId}/tasks`); this just reaches it with a daemon
  token instead of a session, so behaviour (validation, the `{ data }` envelope,
  member-only scoping) is identical. The audit row records whether a task was
  minted by a daemon token or a session (`metadata.source`).
- Config + credential are shared with `engine:claim`/`engine:work`: base URL +
  project id from `.build/.sync`, token from `PM_DAEMON_TOKEN`.
- **Dependencies (G#756):** when creating SEVERAL related tasks (or goals), declare
  their ordering — pass `--blocked-by <#N|slug|uuid>` on each dependent create so it
  is born chained behind its blocker — or state explicitly that the items are
  independent. Never create related items unchained: the fleet claims them in
  whatever order the queue serves, which is the wrong order for dependent work.
