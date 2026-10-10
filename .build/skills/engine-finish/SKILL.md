---
name: engine-finish
description: "Tidy up locally after a task is done. It confirms the task reached a terminal state (done / cancelled), clears the local run context (`.tasks/.engine` + `.tasks/.current`), and **removes the task's git worktree** — auto-deriving its path the same way `engine:work` created it, so you don't pass `--worktree`."
---

# /engine-finish

## Plain English

Tidy up locally after a task is done. It confirms the task reached a terminal
state (done / cancelled), clears the local run context (`.tasks/.engine` +
`.tasks/.current`), and **removes the task's git worktree** — auto-deriving its
path the same way `engine:work` created it, so you don't pass `--worktree`.

It does **not** close anything on GitHub: the *goal* owns the branch and PR, and
delivering the goal (`engine:goal accept`) is what merges it.

**Run from your MAIN checkout.** Git won't remove the worktree you're standing
in, and the session lives inside the worktree — so `cd` back before finishing.

## When to use

- Someone says "finish task #N", "clean up after <slug>", or "I'm done with that
  task" — and the task has already been reported to a terminal state.

Developers never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…`.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.

## Steps

1. **Finish** (from the primary clone) — uses `.tasks/.engine` if present, else name the task:
   ```bash
   ibuild engine finish
   ibuild engine finish <#N | slug | title>
   ```
   Confirms the task is terminal, clears `.tasks/.engine` + `.tasks/.current`, and
   removes the task's worktree (auto-derived; only if it's currently checked out).

2. **Override or stand-alone worktree removal:**
   ```bash
   ibuild engine finish <#N | slug | title> --worktree <path>   # override the derived path
   ibuild engine finish --worktree <path>                       # no task — just remove that worktree
   ```
   `--worktree <path>` runs `git worktree remove --force <path>` unconditionally.
   Passed alone (no task identifier and no `.tasks/.engine`) it skips the
   task/terminal checks and just removes the worktree — for a hand-made one.

## Failure recovery

- **Task not terminal** → it refuses and points at `engine:report`. Drive the
  task to done/cancelled first (`ibuild engine report`), then finish.
- **No identifier and no `.tasks/.engine`** → pass a `#N`/slug (or `--worktree <path>` for a stand-alone removal).
- **Worktree removal fails** → the local context is still cleared; the worktree
  error is surfaced. The usual cause is running from INSIDE the worktree — git
  won't remove the one you're in; `cd` to the primary clone and re-run.

## Notes

- `engine:work` auto-creates a per-goal worktree at a deterministic path (#440);
  `engine:finish` derives that same path and removes it — no `--worktree` needed.
  `--worktree` is now only an override or for a hand-made worktree.
- `engine:report` already clears `.tasks/.engine` on a terminal report; running
  `engine:finish` afterward (by identifier) tidies `.tasks/.current`, confirms the
  terminal state, and removes the worktree.
