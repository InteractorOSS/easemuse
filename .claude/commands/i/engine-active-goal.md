# /engine-active-goal

## Plain English

Session-bound active-goal primitives for accumulating several small change
requests onto ONE goal's branch/worktree instead of minting a new goal — and
therefore a new branch, a new worktree seed, and a new dev-server boot — for
every request. A **goal** is an objective; several requests toward the same
objective belong on one branch and one PR, with tasks as the unit beneath it.
This command is the mechanical support for that: it does NOT decide anything by
itself except the one piece that must never be left to model judgement (the
always-a-new-goal list in step 2).

## When to use this

Inside the engine-goal-run and engine-goal-new steps, on every follow-up change
request in a session that already has an active goal/worktree open:

1. `check-scope` the paths the request is about to touch. If it fires, say so
   out loud and create a new goal (the engine-goal-create step); do not
   improvise around it.
2. If it doesn't fire, the remaining call is judgement: does this fit the
   bound goal's stated objective (same feature area)? If yes, stay on its
   worktree and add another task under it (the engine-create step, or the
   bridge's `pm_spawn_tasks`) rather than opening a new goal.
3. `grow` the bound goal's description so its stated scope keeps matching the
   accumulated diff — do this every time scope is added, not just at the end.
4. Periodically `rebase` the active branch onto the default branch, especially
   before a long pause or handing the session off.

## Prerequisites (one-time)

- Same `.build/.sync` + `PM_DAEMON_TOKEN` as the engine-goal and
  engine-goal-create steps.
- `bind`, `grow` and `rebase` key the binding on the AI session's id, read from
  `CLAUDE_CODE_SESSION_ID` — set automatically by sessions that support it.
  Where your tool does not set it, those three refuse and say so: skip the
  binding, pass `--goal <goalId>` to `grow` explicitly, and rebase with plain
  `git fetch` + `git rebase origin/<default-branch>`. `status` and `unbind`
  degrade gracefully without it, and `check-scope` never needs it at all (it's a
  pure, offline classification).

## Steps

1. **Bind the session to the goal it just took/created**, once, right after
   `ibuild engine goal take <goalId>` (or a fresh `goal-create`):
   ```bash
   ibuild engine active-goal bind <goalRef>
   ```
   Overwrites any prior binding for this session — a session accumulates on
   ONE goal at a time.

2. **Before implementing a follow-up request**, classify the paths it's about
   to touch:
   ```bash
   ibuild engine active-goal check-scope <path> [path...]
   ```
   Exits 0 either way — the verdict is in the printed text, never silent:
   - **`ALWAYS a new goal`** — the paths hit schema/migrations, an API route,
     an engine/daemon wire-contract surface, auth, or billing. These need the
     full queued pipeline regardless of size — create a new goal (the
     engine-goal-create step) and say which reason fired.
   - **`clear`** — the mechanical check found nothing. The ONE remaining
     question is a judgement call this command deliberately does not
     make: does the request fit the bound goal's stated objective? Same
     feature area → stay on this worktree. Different feature area → new goal
     anyway, and say so.

3. **When staying on the bound goal**, fold the new scope into its
   description as soon as you know it (don't wait until the end of the
   session):
   ```bash
   ibuild engine active-goal grow --add "<short description of the added scope>"
   ibuild engine active-goal grow --done-when "<the updated, combined acceptance criteria>"
   ```
   Both flags may be passed together in one call. `--add` appends a bullet to
   a `## Session growth` section (a running log of what accumulated);
   `--done-when` REPLACES the `## Done when` section's body, since acceptance
   criteria are graded from the latest version and a stale prior version left
   in place would just be confusing. Omit `--goal` to target the bound goal;
   pass it to target a different one explicitly.

4. **Periodically, and always before a long pause or handoff**, keep the
   branch from rotting against a fast-moving `main`:
   ```bash
   ibuild engine active-goal rebase
   ```
   Fetches and rebases onto the repo's default branch (or `--base <branch>`).
   A clean rebase or "already up to date" prints and exits 0. A **conflict is
   surfaced, not resolved** — the rebase is left in progress (git's own
   mid-rebase state) so you resolve it the same way you would by hand:
   `git status` to see the conflicted files (also listed in the command's own
   output), fix them, `git add`, `git rebase --continue` (or `git rebase
   --abort` to back out).

5. **Check what's bound**, or clear it when the session is done accumulating
   (e.g. after the goal is delivered and a genuinely new objective starts):
   ```bash
   ibuild engine active-goal status
   ibuild engine active-goal unbind
   ```

## Notes

- The binding is a small pointer file in the OS temp directory, keyed by the
  session id. It tracks which GOAL a session is accumulating scope on, which
  outlives any single run.
- `check-scope`'s always-new-goal list is intentionally **mechanical, not a
  model judgement call** — an assertion that can't be verified isn't worth
  making. Only "is this the same feature area?" is left to you, and this
  command says so explicitly every time rather than silently deciding it.
- This command never creates, admits, queues, or spawns anything itself — it
  only reads/writes the goal's description and the session pointer, and runs
  `git fetch`/`git rebase` in the current worktree. Creating a new goal is
  still the engine-goal-create step; adding a task under the bound goal is
  still the engine-create step (or `pm_spawn_tasks`).
