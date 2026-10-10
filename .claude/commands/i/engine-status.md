# /engine-status

## Plain English

Show where a **specific** task stands. You name it by identifier (`#N`, slug, or
a title fragment); this prints its phase, runtime state, the goal it belongs to,
anything it's paused on, and how many must-fix review findings are still open —
so you can see where it stands without opening the web UI.

Read-only.

## When to use

- Someone asks "what's the status of task #N", "where is <slug>",
  "is <task> blocked / paused / done".
- Before `engine:work` / `engine:approve` / `engine:report`, to check the task's
  current phase + whether it's waiting on a pause.

Developers never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` (the web app
  → Settings → Agent Tokens) — the same token the rest of the local engine loop
  uses. The read endpoints take a daemon token (or a browser session), not the
  project sync token.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.

## Steps

1. **Show status** — pass the identifier the developer gave you:
   ```bash
   ibuild engine status <#N | slug | title-fragment>
   ```
   - Resolves the identifier first (`#N`/bare `N` → display number; exact slug;
     else case-insensitive title substring), then prints the task's phase,
     runtime state, goal, open pauses, and unresolved-findings summary.
   - **Ambiguous** (a title fragment matching several tasks) → it prints the
     candidates and shows nothing. Surface the list; ask which (or use `#N`/slug).
   - **Not found** → it prints suggestions and shows nothing.

## Notes

- **Snapshot vs. wait:** `engine:status` is a **point-in-time** read. When you want to
  *wait for the next change* on a goal (a pause opening, CI/prState moving, the PR
  merging) rather than re-run status in a loop, use `ibuild engine watch <goalRef>
  --supervise` (backgrounded wake-trigger: actionable events only, exits on the first)
  or plain `ibuild engine watch <goalRef>` to stream — push, not poll. See the `engine-watch` step.
- Composes three account-level reads (`/me/engine/resolve`, `/me/engine/tasks/:id`,
  `/me/engine/pauses`) — it never mutates anything.
- **Pauses** shown here are resolved with `engine:approve` (when the task is
  waiting for plan sign-off) or on the `/attention` page (everything else).
- **Goal id:** the goal line shows the goal's display number + title; to act on
  the goal (`engine:goal accept|request-changes`) you need its id — take it from
  the goal's page in the web app or from `engine:create` output.
- **Goal attachments:** a goal can carry attached files (specs, mockups, sample
  data). To see and pull them into the worktree so your session can open them, run
  `ibuild engine goal-files` (lists the current run's goal's attachments; add
  `--download` to fetch them into `.tasks/attachments/<goalId>/`). See the
  `engine-goal` step.
