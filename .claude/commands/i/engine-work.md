# /engine-work

## Plain English

Work a **specific** task you choose — the user-driven counterpart to
the `engine-claim` step (which pops the next queued task automatically). You name the
task by identifier (`#N`, slug, or a title fragment); this opens an
**interactive** run on exactly that task, writes the run context, and hands you
the phase prompt. When you then start your AI coding session, the bridge links it to
the run.

**Worktree isolation is mandatory.** Run from your main checkout and
`engine:work` creates (or reuses) a per-goal git **worktree**, seeds it, writes
the run context THERE, and tells you to `cd` in before starting your session — so a
run can never tangle with the shared checkout. You only work in place if you're
already inside a worktree or pass the discouraged `--no-worktree`.

**You can pick any task; automated agents only ever take queued work** — so
opening a `paused` or even a `blocked` task here is a deliberate override of the
queue's gating.

## When to use

- Someone says "work on task #N", "let's do <slug>", or "pick up
  <title fragment>".
- You want a *specific* task, not "whatever's next in the queue" (that's
  the `engine-claim` step).

Developers never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` (the web app
  → Settings → Agent Tokens). Same token the `engine-claim` step uses; the resolve +
  claim endpoints take a daemon token (or a browser session), not the project
  sync token.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.

## Steps

1. **Work the named task** — pass the identifier you were given:
   ```bash
   ibuild engine work <#N | slug | title-fragment>
   ```
   - Resolves the identifier first (`#N`/bare `N` → display number; exact slug;
     else case-insensitive title substring), then opens an interactive run on it
     and prints the phase prompt; writes `.tasks/.current` + `.tasks/.engine`.
   - **Worktree (default):** run from your main checkout and it creates/reuses the
     task's **per-goal worktree** (`goal/<slug>`, a sibling directory), seeds it
     (copies the gitignored `.build/.sync` + `.env.local`, shares installed
     dependencies, runs your project's setup step), and writes the run context into
     the worktree. It prints the worktree path — **`cd` there before starting
     your session.** Add `--no-worktree` to work in place (discouraged); already inside
     a worktree, it stays put.
   - **Ambiguous** (a title fragment matching several tasks) → it prints the
     candidates and opens **nothing**. Surface the list and ask which one (or use
     the `#N`/slug); do not guess.
   - **Not found** → it prints suggestions and opens nothing.
   - Refuses if `.tasks/.engine` already exists in the destination (a prior
     unfinished run) — finish that run (`ibuild engine report`), remove
     `.tasks/.engine`, or re-run with `--force`.
   - **Already open** → the task is already `running` (someone's on it) or
     terminal (`done`/`cancelled`). Surface the message; don't retry blindly.

2. **Pull the goal's attachments (if any)**: the task's goal may carry attached
   files (specs, mockups, sample data) you'll need to do the work. From the
   worktree, list them and download into the worktree so your session can open them:
   ```bash
   ibuild engine goal-files               # list the current run's goal's attachments
   ibuild engine goal-files --download  # fetch into .tasks/attachments/<goalId>/
   ```
   It resolves the goal from `.tasks/.engine`, so no id is needed. Skip if it
   reports the goal has no attachments.

   **At the START of the phase, check for staged attachments.** In a fleet
   container the daemon pre-stages the goal's attachments to
   `.tasks/attachments/<goalId>/` at scaffold time, and `engine:goal-files` will
   list them straight from that manifest — no daemon token needed.
   - If it lists staged attachment(s), **read each one before implementing** — they
     are the spec/mockup/sample data the work depends on.
   - If it reports a **`.UNREADABLE` sentinel** (staging failed), do **NOT** proceed
     against a guessed spec. This is an **INFRASTRUCTURE / credentials failure**, not a
     scope question: **report it LOUDLY and fail the run** (`engine:report --fail`
     naming the goalId) with the unblock steps it printed (re-upload / check the daemon
     token / re-run so staging retries). **NEVER** raise an unreadable/missing
     attachment as a `pm_request_design_discussion`, a `pm_ask_question`, or any
     clarification — it is an operator infra fault to fix, not a design gap to discuss.
   - If it reports a **sync-token-only, nothing-staged** message and the work depends on
     an attachment you can't read, treat it the same way — surface it as an infra failure
     (re-run `engine:work` / re-claim so staging retries) rather than implementing blind
     or opening a design discussion.

   **Asking a human — write for a non-engineer.** `pm_ask_question` and
   `pm_request_design_discussion` both take a `summary` (<=120 chars) and a `detail`.
   `summary` is the headline a NON-TECHNICAL decision-maker reads (someone with no
   engineering background deciding what to do) — name WHAT is being decided, never how,
   and NEVER include file names, test names, PR numbers, branch names, tool names, or
   code identifiers. All of that technical grounding goes in `detail` instead. Each
   answer option's `label` must be a plain OUTCOME the reader can choose between, never
   an implementation instruction, with the same no-jargon rule; an optional `consequence`
   line explains what changes if it's picked.

   Worked example:
   - BEFORE (jargon leaking into the headline): summary omitted; detail = "Should I drop
     the checkout type-fix from this PR since it's touching unrelated test suites in
     `checkout-client.test.tsx`?"
   - AFTER: `summary` = "Ship the current changes now, or wait and include an unrelated
     test fix?"; `options` = `[{label: "Ship now", consequence: "The unrelated test fix
     ships in a separate PR later"}, {label: "Wait and include it", consequence: "This PR
     takes longer but ships both together"}]`; `detail` keeps the full technical
     explanation (file names, test names, the PR reference) for the record.

3. **Work the phase**: `cd` into the worktree it printed, start your session there, and
   carry out the phase prompt. The bridge registers a session and links it to the
   run — the bridge binds to the cwd, so it MUST be the worktree.

4. **Report** when the phase deliverable is ready:
   ```bash
   ibuild engine report            # success
   ibuild engine report --fail "reason"   # or release the run
   ```
   This clears `.tasks/.engine` on a terminal report so the next `engine:work`
   isn't blocked.

## Notes

- **Automated agents vs you:** an agent claiming work (`engine:claim`) only takes
  `queued` runnable tasks. `engine:work` opens a run on *any* non-terminal,
  non-running task you name — including `blocked` (overriding its unmet
  dependencies). The flip to `running` is atomic, so if an agent grabs a queued
  task at the same instant, one side wins and the other gets a clean refusal.
- **Goals:** there is no goal-level "work" — a goal is a container. To work a
  goal, work its tasks one at a time with `engine:work`. They share the goal's
  single worktree (one PR per goal), so the 2nd+ task reuses it.
- **Teardown:** when the goal's work is merged, run `ibuild engine finish #N`
  **from your main checkout** — it derives and removes the task's worktree, so no
  `--worktree` is needed. `engine:work` prints this exact command when it makes
  the worktree. (Git won't remove the worktree you're standing in — hence "main
  checkout".)
