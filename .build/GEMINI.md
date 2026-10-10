<!-- BEGIN BUILD WORKFLOW COMMANDS (managed by Build — edits inside this block are overwritten) -->

# Build workflow commands

This project's goal + task workflow, generated from one shared source so every AI tool reads
the same instructions — edit `apps/web/src/templates/workflow-source/`, never this section.

## Workflow commands

These are the goal + task lifecycle commands Interactor Build runs, driven through the
`ibuild` binary (`ibuild engine <cmd>`) or the Build connector's tools. You are not expected
to type them — say what you want in plain language and your assistant runs the right one.

- **engine-approve** — Sign off on a task's **plan** before it starts building — or reject it.
- **engine-claim** — Pick up the next runnable task from the terminal as an **interactive** run — the human counterpart to an agent claiming work headlessly. This claims the task, writes the run context, and tells you what to do next. When you then start your AI coding session, the bridge links it to the run, so the task shows the live session working on it.
- **engine-create** — Create a new task in the current project from the terminal, then hand back its `#N` so you can immediately work it. This is the "add a task to do X" counterpart to the `engine-claim` step (which picks up an *existing* runnable task). It uses the same daemon token the rest of the local loop uses, so you — or a headless agent — can add work without opening the web UI.
- **engine-finish** — Tidy up locally after a task is done. It confirms the task reached a terminal state (done / cancelled), clears the local run context (`.tasks/.engine` + `.tasks/.current`), and **removes the task's git worktree** — auto-deriving its path the same way `engine:work` created it, so you don't pass `--worktree`.
- **engine-goal** — Look at a goal, and decide about it, from the terminal — check its **status** (one read that tells you where the goal actually stands), accept a goal (deliver it), request changes (send it back for rework), **admit** it (start a goal that was created but not yet queued — the second half of the `engine:goal-create` → start path), **pause / resume** it (a reversible hold on a started goal, optionally stopping its in-flight runs), or **land** a goal you're driving by hand (hand it to the delivery queue — hand-back + arm-accept + watch, in one verb — instead of hand-retrying `accept` against a moving `main`). A goal owns the branch and the PR, so accepting it is what lands the work, requesting changes is what reopens it, and pausing is the reversible brake that holds a goal without closing it.
- **engine-goal-create** — Create a new engine **goal** in the current project from the terminal — the headless counterpart of the web Goals page's "New goal" form. A goal is the engine's integration unit (the *objective*; it owns the branch + PR and is what a GitHub issue maps to). This is the goal-grain sibling of the `engine-create` step, which mints an EngineTask *under* a goal. It authenticates with the same daemon token the rest of the local engine loop uses, so a developer — or the headless daemon — can create a goal without the web UI.
- **engine-readiness** — Inspect and drive a connected repo's **automation readiness + setup** from the terminal — the CLI counterpart to the web UI's **Fleet setup** driver (project settings → integrations). Lets the interactive agent see the readiness gate, run the whole setup pipeline, and adopt a proposed build & test setup without the browser. Setup is per **connection/repo** — the executing machine is invisible.
- **engine-report** — Report the outcome of the run you're working — the step that drives the task forward. After you've done a phase's work in your AI coding session (and submitted the deliverable with `pm_submit_artifact`), this says the run is done; the server advances the task to the next phase, completes it, or pauses it. On a terminal report it clears `.tasks/.engine` so the next claim isn't blocked.
- **engine-report-issue** — File a **friction report** — a stuck lease, a bridge 409, a confusing refusal, a missing capability — as a deduplicated Feedback report on the Build project, via a server-side cross-tenant hop. This session never needs its own access to Build. `.build/CLAUDE.md` §4 is why this exists: an infrastructure failure is something to REPORT, not a question for a human and not something to silently work around.
- **engine-review** — Run a code review of the **active task's worktree** — correctly. It is the worktree-aware wrapper around the `/code-review` plugin.
- **engine-status** — Show where a **specific** task stands. You name it by identifier (`#N`, slug, or a title fragment); this prints its phase, runtime state, the goal it belongs to, anything it's paused on, and how many must-fix review findings are still open — so you can see where it stands without opening the web UI.
- **engine-watch** — Stream a **goal's** live lifecycle events over SSE instead of polling for them. You name the goal by identifier (`G#N`, `#N`, slug, title fragment, or UUID); this subscribes once to the events the server already pushes on `/api/sse/me`, filters to that goal, and prints a structured line per event — pause opened (+ kind), pause resolved, PR/CI/deploy-gate change, `pr_merged`, phase/admission advance.
- **engine-work** — Work a **specific** task you choose — the user-driven counterpart to the `engine-claim` step (which pops the next queued task automatically). You name the task by identifier (`#N`, slug, or a title fragment); this opens an **interactive** run on exactly that task, writes the run context, and hands you the phase prompt. When you then start your AI coding session, the bridge links it to the run.
- **interactor-design-guide** — Apply the Interactor server design system (blue accent, compact 3-8px radii) to UI/UX components so they stay visually and behaviorally consistent with interactor-server. Only relevant when a project is deliberately matching Interactor server visuals — a project with its own design system should follow that instead.
- **ship** — Turn a working tree full of changes — or a branch already pushed ahead of the default branch — into a goal, with no manual `goal-create --pr-boundary` / `gh pr create` / `goal link-pr` dance. Commits any uncommitted changes (with your confirmation), pushes to `ship/<user>-<short-sha>` (or a branch you name), then adopts that push as a **PR-boundary goal** — built for a moment in human mode so nothing else can claim it mid-construction, then handed straight back to agent mode with one review task already queued — a linked PR already open, ready for the normal review → CI → delivery-queue path.

### engine-approve

**When to use:** - Someone says "approve the plan for task #N", "the plan for <slug> looks good — let it run", or "reject <task>, the scope is wrong". - A task is waiting for plan sign-off (visible via `engine:status` or on the `/attention` page). People never type this — they say it in natural language and you run the flow on their behalf (see `.build/CLAUDE.md` §3).

## Plain English

Sign off on a task's **plan** before it starts building — or reject it.

Projects can be set to hold every task for a human OK between investigation and
execution (the "require plan sign-off" project setting). When that's on, a task
that finishes investigation stops and waits, and this is how you release it from
the terminal: approving sends the task on to execution; rejecting cancels it.

If your project doesn't have that setting on, tasks flow straight from
investigation into execution and you'll never need this command.

## When to use

- Someone says "approve the plan for task #N", "the plan for <slug> looks good —
  let it run", or "reject <task>, the scope is wrong".
- A task is waiting for plan sign-off (visible via `engine:status` or on the
  `/attention` page).

People never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` — the same
  token the rest of the local engine loop uses.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.

## Steps

1. **Approve** the task's plan:
   ```bash
   ibuild engine approve <#N | slug | title-fragment>
   ```
   Resolves the identifier, finds the task's open plan-sign-off pause, and
   releases it → the task advances from investigation to execution.

2. **Reject** instead (cancel the task):
   ```bash
   ibuild engine approve <#N | slug | title-fragment> --reject "reason"
   ```
   The reason is shown in the output; the task is cancelled.

## Failure recovery

- **Nothing waiting for sign-off** → it refuses with a clear message. The task may
  not be at that point yet, or your project doesn't hold tasks for plan sign-off.
  Check with `engine:status`.
- **Ambiguous / not-found identifier** → it prints candidates/suggestions and
  resolves nothing; pick a `#N`/slug.

## Notes

- This command only releases the plan-sign-off hold. The correctness checks —
  tests, security, scope — happen in the task's **review** phase, not here.
- The plan itself (the acceptance criteria) is written by working the
  investigation phase and submitting an `acceptance_criteria` artifact with
  `pm_submit_artifact`. There's no separate plan-drafting command;
  `engine:approve` is just the sign-off.
- Anything else a task can be waiting on (risk, repeated rework, a review
  standoff, an operator action, a question for you) is resolved on the
  `/attention` page, not here.

### engine-claim

**When to use:** Someone says "what's next", "grab the next task", or "claim something to work on" and doesn't already know which task they want — that's `engine:claim`, the queue-driven counterpart to `engine:work` (which opens a SPECIFIC task by name).

## Plain English

Pick up the next runnable task from the terminal as an **interactive** run — the
human counterpart to an agent claiming work headlessly. This claims the task,
writes the run context, and tells you what to do next. When you then start
your AI coding session, the bridge links it to the run, so the task shows the live
session working on it.

## Prerequisites (one-time)

- A **daemon token**: in the web app, go to **Settings → Agent Tokens**,
  generate one (`pm_daemon_…`, shown once), and add it to `.env.local`:
  ```
  PM_DAEMON_TOKEN=pm_daemon_xxxxxxxx…
  ```
  The claim endpoint takes a daemon token (or a browser session), not the
  project sync token — so a terminal claim needs this.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.
- A **runnable task** must exist (status `queued`, dependencies met).

## Steps

1. **Claim** the next runnable task interactively:
   ```bash
   ibuild engine claim
   ```
   - Prints the claimed task + the phase prompt, and writes `.tasks/.current`
     and `.tasks/.engine`.
   - "Nothing runnable to claim" → there is no queued task ready; nothing to do.
   - Refuses if `.tasks/.engine` already exists (a prior unfinished claim) — finish
     that run, remove `.tasks/.engine`, or re-run with `--force`.

2. **Check for staged goal attachments** (do this at the START of the phase). The
   daemon stages the goal's attachments to `.tasks/attachments/<goalId>/` at
   scaffold time — so a fleet/daemon run, which holds only the project sync token,
   can read them by path without ever needing `PM_DAEMON_TOKEN`:
   ```bash
   ibuild engine goal-files   # lists the current run's goal's staged attachments
   ```
   It reads the staged `index.json` manifest (no token, no API call), so it works
   in the container. Then:
   - **Staged file(s) listed** → **read each one before implementing** — they are
     the spec / mockup / sample data the work depends on; open them by path under
     `.tasks/attachments/<goalId>/`.
   - **`.UNREADABLE` sentinel** (staging failed) → do **NOT** proceed against a
     guessed spec. **Raise an ATTENTION PAUSE naming the goalId** and the unblock
     steps it printed (re-upload / check the daemon token / re-run so staging
     retries).
   - **Sync-token-only, nothing staged** message → attachments were never staged;
     surface that (re-claim / re-run so staging retries) rather than guessing.
   - **"no attachments"** → nothing to do; continue.

3. **Work the phase**: start your AI coding session in this directory and carry out the phase
   prompt. The bridge registers a session and links it to the run automatically
  . If the session doesn't appear linked, check the bridge stderr —
   the link is best-effort (logs, never crashes the session).

4. **Submit the deliverable** via the bridge tool `pm_submit_artifact` (available
   because `.tasks/.engine` is present), e.g. a `pr_ref` / `plan` / `decision_record`
   matching the phase's required artifact.

5. **Report the run done** with the report vehicle (reads the `runId` from
   `.tasks/.engine`, drives the task forward, and clears `.tasks/.engine` for the
   next claim):
   ```bash
   ibuild engine report
   ```
   It prints what the task did — advanced to the next phase, completed, or paused
   (risk / kickback / review-standoff / operator-action → resolve on `/attention`).
   To **release a stuck/abandoned run** back to the queue instead:
   ```bash
   ibuild engine report --fail "reason"
   # or, with a default reason:
   ibuild engine report --abandon
   ```

## Notes

- One claim at a time: `.tasks/.engine` is the single in-flight run context;
  the claim refuses to overwrite it without `--force`. `engine:report` clears it
  on a terminal report.
- Abandoned interactive runs are also auto-recovered: a server-side reaper
  fails a run whose session has gone stale/ended and pauses the
  task on `/attention` — so you don't strictly have to `--fail` a run you walked
  away from, though doing so is immediate.

### engine-create

**When to use:** Someone says something like "create a task to <do X>", "spin up a task for <Y>", or "I need a task to track <Z>" — and wants it created right now, locally, ready to work, beneath an EXISTING goal. For a new objective/bug/feature itself, use engine-goal-create instead.

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

### engine-finish

**When to use:** - Someone says "finish task #N", "clean up after <slug>", or "I'm done with that task" — and the task has already been reported to a terminal state. Developers never type this — they say it in natural language and you run the flow on their behalf (see `.build/CLAUDE.md` §3).

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

### engine-goal

**When to use:** - Someone asks "**how does goal #2320 look?**", "where's the <X> goal at", "is it paused", "has its PR gone green" — that's `status`. It only reads, so run it whenever you'd otherwise guess. - Someone says "accept goal <id>", "deliver the <X> goal", or "request changes on goal <id> — <what to fix>". - Someone says "**admit** goal <id>", "**start** the <X> goal", or "**queue** goal <id>" — start a goal that isn't running yet (typically one just made with `engine:goal-create` — see the `engine-goal-create` step). `admit` only starts it; it won't lift a pause. - Someone says "**pause** goal <id>", "**hold** the <X> goal", "**stop** the running task(s) on <id>", or "**resume** goal <id>". Pausing is reversible — reach for it (not `close`) whenever they want to *hold* work, and add `--stop-running` when they want the in-flight run(s) stopped now, not after the current phase finishes. - Someone says "**ship** goal <id>", "**land** goal <id>", or a hand-driven session finishes a goal and asks how to get it merged. **Never call `accept` yourself on a hand-driven goal** — `land` replaces that: it hands back, arms accept-when-ready, and watches, so the goal rides the delivery queue's merge train instead of racing a `main` that merges every 10–40 minutes. Developers never type this — they say it in natural language and you run the flow on their behalf (see `.build/CLAUDE.md` §3).

## Plain English

Look at a goal, and decide about it, from the terminal — check its **status**
(one read that tells you where the goal actually stands), accept a goal (deliver
it), request changes (send it back for rework), **admit** it (start a goal that
was created but not yet queued — the second half of the `engine:goal-create` →
start path), **pause / resume** it (a reversible hold on a started goal,
optionally stopping its in-flight runs), or **land** a goal you're driving by
hand (hand it to the delivery queue — hand-back + arm-accept + watch, in one
verb — instead of hand-retrying `accept` against a moving `main`). A goal owns
the branch and the PR, so accepting it is what lands the work, requesting
changes is what reopens it, and pausing is the reversible brake that holds a
goal without closing it.

## When to use

- Someone asks "**how does goal #2320 look?**", "where's the <X> goal at", "is it
  paused", "has its PR gone green" — that's `status`. It only reads, so run it
  whenever you'd otherwise guess.
- Someone says "accept goal <id>", "deliver the <X> goal", or "request
  changes on goal <id> — <what to fix>".
- Someone says "**admit** goal <id>", "**start** the <X> goal", or "**queue**
  goal <id>" — start a goal that isn't running yet (typically one just made with
  `engine:goal-create` — see the `engine-goal-create` step). `admit` only starts it; it
  won't lift a pause.
- Someone says "**pause** goal <id>", "**hold** the <X> goal", "**stop**
  the running task(s) on <id>", or "**resume** goal <id>". Pausing is reversible
  — reach for it (not `close`) whenever they want to *hold* work, and
  add `--stop-running` when they want the in-flight run(s) stopped now, not after
  the current phase finishes.
- Someone says "**ship** goal <id>", "**land** goal <id>", or a hand-driven
  session finishes a goal and asks how to get it merged. **Never call
  `accept` yourself on a hand-driven goal** — `land` replaces that: it hands
  back, arms accept-when-ready, and watches, so the goal rides the delivery
  queue's merge train instead of racing a `main` that merges every 10–40
  minutes.

Developers never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…`.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.
- A **goal reference**. `<goalId>` accepts `G#<n>`, `#<n>`, a bare number, the
  goal's slug, a title fragment, or the raw UUID — resolved via the shared
  `GET /api/v1/me/engine/goals/resolve` endpoint (an ambiguous or unmatched ref
  fails with a legible error; a UUID is used directly). `engine:status` and the
  Goal detail page show the refs.

## Steps

1. **Status** — read one goal's whole state. Usually the first thing to run:
   ```bash
   ibuild engine goal status <goalId>      # G#2320 | #2320 | 2320 | slug | title fragment | uuid
   ```
   `engine:status` reads a **task**, so a goal reference gets you "No engine task
   matches" — this is the goal version of it. It only reads: one GET, no writes,
   nothing to undo. In one screen you get the goal's status, who owns it and who
   created it, its branch and PR (state, number, link — one line per repo when the
   goal ships to several), the deploy gate and when it was last checked, how many
   of its tasks are done, whether the work has reached review, and whether the goal
   is paused (with the reason and how long it has been held).

   It will **not** tell you "this is blocked" or "this is fine" — that call is made
   in one place, and this command deliberately doesn't second-guess it. Its last two
   lines point you there: `engine:why` for why each task is or isn't being picked up,
   and the goal's page in the web app for the plain-language state banner.

2. **Accept** (deliver) a goal:
   ```bash
   ibuild engine goal accept <goalId>
   ```
   - A **non-prBoundary** goal is marked `accepted` once its child tasks are
     complete.
   - A **prBoundary** goal enforces the strict PR gate (PR `ready` + merge/deploy
     gate passed) and merges the PR on accept.
   - **Waiting for the gate instead of polling:** when a goal isn't ready to accept
     yet (PR still building, CI/deploy gate pending, or you're monitoring to merge),
     don't loop on `gh pr checks` or a `sleep` timer — `ibuild engine watch <goalId>
     --supervise` (backgrounded) blocks until the next actionable event (prState / CI /
     deploy-gate move, a pause, or `pr_merged`) then exits, so you re-check + accept
     exactly when something changed. See the `engine-watch` step.

3. **Request changes** (spawn rework):
   ```bash
   ibuild engine goal request-changes <goalId> --title "Fix X" --desc "details"
   ```
   Spawns one rework task under the goal (with `spawned_from` lineage) and moves
   the goal back to `in_progress`. The single `--title`/`--desc` is sent as the
   route's one-element `changes` array.

4. **Admit** (start a dormant goal) — the first-class admission verb:
   ```bash
   ibuild engine goal admit <goalId>
   ```
   Stamps the goal's `admittedAt` and spawns its scoping planning task, so a plain
   GET of the goal shows it started (not only the spawned task). `admittedAt` —
   not `status` — is the goal's own started-signal: admission does not transition
   `status`. This is the terminal counterpart to the web "New goal → start" flow,
   and the second half of the create→start path (see the `engine-goal-create` step):
   ```bash
   ibuild engine goal-create "<title>" --dormant
   ibuild engine goal admit <goalId>
   ```
   (A plain `goal-create` without `--dormant` auto-admits on an AUTO project, so
   `admit` is the start verb for dormant creates and manual-mode projects.)
   - It is **admission-only** and does **not** lift a manual pause — a paused goal
     is refused (409) with a message pointing at `resume`. Use `resume` to lift a
     pause; use `admit` to start a never-admitted goal.
   - `admit` hands the goal to the fleet — it will be scoped and run **autonomously**.
     The command prints a blast-radius notice pointing at `pause` (below).
   - `queue` remains a backward-compatible alias (it calls the `resume` endpoint,
     which additionally promotes backlog tasks + pipeline-gates on dependencies).
     Prefer `admit` for a plain dormant goal; reach for `queue` only when you need
     that superset behavior.

5. **Pause** (reversible hold) a goal:
   ```bash
   ibuild engine goal pause <goalId> [--reason "..."]              # graceful: no new work claimed
   ibuild engine goal pause <goalId> --stop-running [--reason "..."]  # also stop in-flight run(s) now
   ```
   Sets a manual goal-level pause the claim gate skips and clears admission, so
   the fleet takes **no new work** on the goal until you `resume`. It is **not**
   terminal — prefer it over `close` whenever the intent is to *hold*.
   - Without `--stop-running`, any run already in flight finishes its current
     phase; the goal just won't pick up more.
   - With `--stop-running`, open runs are **reversibly preempted** — aborted and
     re-queued at their current phase (they re-run on resume, no retry-budget
     burn). The command reports how many runs were stopped. This is the terminal
     analog of the web UI's "pause + stop running tasks" control.

6. **Resume** (lift the hold + re-admit):
   ```bash
   ibuild engine goal resume <goalId>
   ```
   Lifts the manual pause and re-admits the goal (same endpoint as `queue`);
   any run stopped via `--stop-running` re-runs from where it was preempted.
   Distinct from `admit`: `resume` clears a manual pause (and retries failures);
   `admit` only starts a never-admitted goal and refuses a paused one.

7. **Land** — hand a FINISHED, hand-driven goal to the delivery queue:
   ```bash
   ibuild engine goal land <goalId> [--manual-stop] [--no-watch]
   ```
   The single verb that replaces a hand-driven `accept`. On a repo where
   `main` merges continuously, an `accept` called by hand loses the race by
   construction: it refuses a behind-base branch, the engine merges `main`
   in, that invalidates the review that was just done, and a re-review round
   is needed — so by the time you're done driving it by hand, `main` has
   moved again. `land` gets off that treadmill in one call:
   1. Reads the goal and prints its readiness (tasks complete? review at
      HEAD? deploy gate? unresolved must-fix?) — it does **not** refuse on an
      incomplete goal, it just says what's still outstanding.
   2. **Hands the goal back** to the agent (`POST
      /api/v2/projects/:projectId/goals/:goalId/hand-back-to-agent`). A 422
      ("not in human mode") is a calm **no-op** here, not an error — the
      goal is already a delivery-queue member.
   3. **Arms accept-when-ready** (`ibuild engine goal arm-accept <goalId>` —
      the one-shot "accept automatically once gates pass") — unless
      `--manual-stop`, in which case it prints that the goal will park at
      ready-to-accept instead, and that an un-armed goal is not a
      delivery-queue member (so its branch is not proactively rebased while
      it waits).
   4. **Watches** the goal (the same push-driven wait
      `ibuild engine watch <goalId> --wait` runs) unless `--no-watch`. When
      it wakes, it re-reads status and prints the ONE next action: the
      goal's own diff needs you → fix it and `land` again; the engine is
      healing itself (an infra rerun, a stale-base refresh, a merge train, a
      platform hiccup) → keep watching; delivered/accepted → safe to close
      the session.

   Idempotent — running `land` twice is harmless.

8. **Preview** — terminal parity for the goal page's "Try it" flow:
   ```bash
   ibuild engine goal preview <goalId>                # what "Try it" means for this goal
   ibuild engine goal preview <goalId> --try [--wait]  # perform the confirmed environment's mode
   ibuild engine goal preview <goalId> --release       # release a single-slot review-lock hold
   ```
   Reads the project's confirmed review environment for this goal and reports
   what "Try it" means per delivery mode — never a guess, never silent: the
   provider's preview link and freshness for `provider_per_branch`; the
   environment name + mode + whether Build can dispatch it for
   `workflow_with_ref` / `tag_pattern` / `branch_tracking`; the worktree
   dev-server recipe for `local`; and the project's preview-readiness verdict
   + ranked options when no environment is confirmed. `--try` dispatches
   through the same primitive the post-merge "Run your deploy mechanism"
   card uses, pointed at the goal's own head — gated on run consent where the
   mode needs it, and refusing rather than guessing a tag name for a
   wildcarded tag pattern. `--wait` polls (bounded) for it to resolve.
   `--release` is an honest no-op until the review-lock feature itself ships.
   `goal status` also prints a `Preview:` line with the same one-line summary.

9. **Tag / category / star** — label a goal so it can be found and filtered:
   ```bash
   ibuild engine goal tag <goalId> --add urgent,claritiv --remove stale
   ibuild engine goal category <goalId> "Claritiv"   # set it (a new name is created)
   ibuild engine goal category <goalId> none          # clear it
   ibuild engine goal star <goalId> [--off]           # your own personal star
   ```
   A goal has at most ONE category and any number of tags; both belong to the
   project. A star is yours alone — nobody else sees or sets it, and it is not
   a notification. `goal status` prints a `labels:` line; to list by them, use
   `ibuild engine goals --tag <name> --category <name> --starred` (`--tag`
   repeats, and a goal must carry every tag named).

## Failure recovery

- **409 on `accept` of a prBoundary goal** → the goal's PR isn't `ready` or the
  merge/deploy gate hasn't passed. With the daemon goal-PR git machinery not yet
  built (it creates the goal branch + integration PR and reports CI), a
  prBoundary goal has no real PR locally, so this 409 is **expected** — accept
  works for non-prBoundary goals today. Surface the message; don't retry.
- **404** → the goalId is malformed or not in your project.
- **409 `goal_paused` on `admit`** → the goal is under a manual pause; `admit`
  is admission-only and won't lift it. Run `resume` instead.
- **422 during `land`'s hand-back step** → expected and reported as a calm
  no-op — `land` is idempotent, so a goal that's already a delivery-queue
  member just moves on to arm-accept.

## Daemon goal endpoints (create + admit)

Both halves of the terminal create→start path are first-class account-level
endpoints, authenticated with the daemon token (a browser session works too):

- **Create** — `POST /api/v1/me/engine/goals`. Body: `projectId` + `title`
  (required), plus optional `description`, `type`, `priority`, `parentGoalId`,
  `ownerId`, `autoAdmit`, `runOnAssign`, `prBoundary`, `autoDeliver`, `repos`,
  `connectionIds`, `blockedBy`, `force`. Returns the created goal under
  `{ data }`. This is what `engine:goal-create` calls — flags and semantics in
  the `engine-goal-create` step.
- **Admit** — `POST /api/v1/me/engine/goals/[goalId]/admit` (empty JSON body).
  Admission-only: stamps `admittedAt`/`admittedById` (server-side, from the
  token owner) and spawns the scoping planning task. Returns
  `{ data: { admitted, alreadyAdmitted, planningSpawn } }` — already-admitted
  is an idempotent no-op, not an error. A manually-paused goal is refused with
  409 `goal_paused`, directing you to resume.
- **Resume** (distinct endpoint) — `POST /api/v1/me/engine/goals/[goalId]/resume`
  is the superset that lifts a manual pause, retries failure pauses, promotes
  backlog tasks, and re-admits. `resume` and the `queue` alias both call it;
  `admit` does not.

The goal's own **started-signal is `admittedAt`**, not `status` — a plain
`GET /api/v1/me/engine/goals/[goalId]` reflects admission via `admittedAt`
(admission causes no `status` transition).

## Goal attachments

A goal may carry **attachments** — specs, mockups, sample data a human uploaded
on the Goal detail page. A task run needs to open these by path (the browser
download route is cookie-only, so a terminal session can't read them directly).

**Attachments are now AUTO-STAGED.** When a run is seeded — by the daemon at
scaffold time, or by `engine:work` for an interactive run — the goal's attachments
are downloaded into `.tasks/attachments/<goalId>/` along with an `index.json`
manifest. The run just opens the files from there; it does **not** need to fetch
them itself, and (crucially) does **not** need a `PM_DAEMON_TOKEN` — staging is
done with the privileged daemon token *before* the run starts, and the run only
ever holds the project sync token.

```bash
ibuild engine goal-files                 # list the CURRENT run's goal's staged attachments
ibuild engine goal-files <goalId>     # list a specific goal's attachments
ibuild engine goal-files --download   # (re)download via PM_DAEMON_TOKEN if nothing is staged
```

- `engine:goal-files` is **container-aware**: it serves from the staged
  `index.json` manifest with **no token and no API call** when files are already
  on disk; it falls back to live discovery + `--download` only when a
  `PM_DAEMON_TOKEN` is present and nothing is staged.
- With no `<goalId>` it resolves the goal from the active `.tasks/.engine` task,
  so right after `engine:work` (or in a daemon run) you can just run it.
- **`.UNREADABLE` sentinel** in the goal dir means staging **failed**. Do not
  implement against a guessed spec — `engine:goal-files` prints a loud message
  carrying the `ENGINE_ATTACHMENT_INFRA_FAILURE` marker and exits with a dedicated
  non-1 code. This is an **INFRA / credentials failure**: **report it loudly and
  fail the run** with the unblock steps (re-upload / check the daemon token / re-run
  so staging retries). An unreadable/missing attachment is **never** a
  `pm_request_design_discussion` / `pm_ask_question` / clarification.

## Notes

- The CLI never spoofs an actor: the rework tasks' creator is the daemon token's
  OWNER (a real user), set server-side from the token, never from the CLI.
- Goal-level "work" doesn't exist — a goal is a container; work its child tasks
  with `engine:work`, then make the goal decision here.

## Dependencies on multi-goal proposals (G#756)

When a session proposes MORE THAN ONE goal, settle the ordering before creating:
decide which goals block which (ask the operator if it isn't obvious), then create
each dependent goal with `ibuild engine goal-create "<title>" --blocked-by
<G#N|slug|uuid>` — the goal is BORN chained (the `blockedBy` field rides the create
request; there is no separate edge step). If the goals are genuinely independent,
say so explicitly when summarising what was created. Unchained related goals get
scoped and run by the fleet in the wrong order.

### engine-goal-create

**When to use:** The developer says "create a goal for <X>", "file <this bug/friction> as a goal", or "new goal: <Y>" — and wants it minted right now from the terminal, optionally started. For a task under an EXISTING goal, use engine-create instead; mapping is by role, not name — a bug/feature/objective is a goal, a unit of work beneath one is a task.

## Plain English

Create a new engine **goal** in the current project from the terminal — the
headless counterpart of the web Goals page's "New goal" form. A goal is the
engine's integration unit (the *objective*; it owns the branch + PR and is what
a GitHub issue maps to). This is the goal-grain sibling of the `engine-create` step,
which mints an EngineTask *under* a goal. It authenticates with the same daemon
token the rest of the local engine loop uses, so a developer — or the headless
daemon — can create a goal without the web UI.

By default the create is **instant-autopilot**: it sends the `autoAdmit` hint,
so on an AUTO project the goal is admitted at birth and its scoping `planning`
task spawns immediately for an idle fleet to claim. Pass `--dormant` to create
the goal dormant (task-less) and start it later with `ibuild engine goal admit`
— together they are the documented terminal create→start path.

## When to use this

The developer says "create a goal for <X>", "file <this bug/friction> as a
goal", or "new goal: <Y>" — and wants it minted right now from the terminal,
optionally started. Map that to a single `engine:goal-create` call with the
title (and description/type/priority/dependency flags) extracted from their
ask.

For a **task** under an existing goal, use the `engine-create` step instead. Mapping is
by role, not name: a bug/feature/objective → **goal**; a unit of work beneath
one → task.

### Is this goal's scope already written? (the four criteria)

There is **no flag for this** — the old `--pre-scoped` assertion is removed. Every
goal's admit spawns a `planning` task. What that run does depends on your
description: if it is already a complete plan, the run detects that itself,
**verifies it against the repository**, and short-circuits to ONE implementation
task instead of re-scoping from scratch. **All four must hold** for it to take
that path — so write them into the description; if any fails, it plans normally:

1. **The investigation already happened** — root cause located or design
   decided, NOT hypothesized. A description saying "investigate why X" is an
   automatic disqualifier.
2. **The description names concrete files/modules and testable done-when
   criteria.**
3. **The work is one PR-sized unit** needing no decomposition.
4. **No open decisions the requester would need to answer** — if a
   `pm_ask_question` would be expected during scoping, the fast path does not
   apply.

Typical fast path: a spec an interactive session just finished writing, naming
module paths, thresholds, and test cases. Typical normal planning: "why is X
slow" — the diagnosis IS the work, so planning earns its keep. You certify
nothing, and ambiguity always falls through to normal planning. Nothing skips
investigation either: the implementation task the fast path spawns still
investigates, and pauses to ask you rather than improvising a different plan if
the scope you wrote turns out to be wrong.

## Prerequisites (one-time)

Same config + credential as `engine:create`/`engine:claim`:

- A **daemon token** in `.env.local` (`PM_DAEMON_TOKEN=pm_daemon_…`) — mint it
  in the web app under **Settings → Agent Tokens**. On a fresh machine,
  `ibuild setup` (run automatically by the first `ibuild sync`) writes it to
  `.env.local` alongside the project sync token in `.build/.sync`. The token
  owner becomes the goal's creator, and creation is scoped to that owner's own
  projects.
- A **linked project**: base URL + project id come from `.build/.sync` (run
  `ibuild sync` from the project root if it's missing).

## Steps

1. **Check for an existing goal first.** A non-terminal goal with the same
   title already existing is a duplicate-initiative collision — the server
   refuses the create with a `409`. List what's open before minting:
   ```bash
   ibuild engine status            # open work across the project's goals
   ```
   If the objective is already tracked, work that goal instead of creating a
   twin.

2. **Create** the goal:
   ```bash
   ibuild engine goal-create "<title>"
   ```
   Optional flags:
   - `--desc "<text>"` — longer context. Alone it is sent verbatim as the
     goal's description.
   - `--why "<text>"` / `--done-when "<criteria>"` — **template sugar**: with
     either present, `--desc`/`--why`/`--done-when` compose into the same
     `## What are we building?` / `## Why does it matter?` / `## Done when`
     markdown the web New Goal form produces (blank sections are skipped).
   - `--dormant` (alias `--no-admit`) — omit the `autoAdmit` hint so the goal
     is created **dormant** (no scoping task spawned); start it later with
     `admit` (step 3).
   - `--type <feature|bug|chore>` — classification (server default `feature`).
   - `--priority <low|medium|high|urgent>` — ordering priority (server default
     `medium`).
   - `--vision "<text>"` — how this goal moves the product vision (1–3
     sentences, max 1,000 chars). Optional — a goal without one is never
     refused; an `aligned` admission triage can auto-fill it later.
   - `--parent <goalRef>` — nest under a parent goal.
   - `--category <name>` / `--tag <name,…>` — give the goal a category (at most
     one) and/or tags (repeatable) at birth; a new name is created on the fly. A
     `#name` in the title becomes a tag too.
   - `--blocked-by <goalRef>` — the new goal is BORN blocked by that goal (the
     dependency rides the create request itself; a bad ref means NO goal is
     created, never a half-state).
   - `--repos <owner/repo,… | connId,…>` — multi-repo goal (epic b2007584):
     target one or more connected GitHub repos, as a comma-separated mix of
     `owner/repo` full-names and/or connection UUIDs (resolved server-side).
     Omit for the default single-primary-repo goal.
   - `--owner <userId>` — set the goal's owner.
   - `--run` (alias `--admit-for-owner`) — assign-&-run (G#406): paired with
     `--owner U`, the goal is created ALREADY admitted on U's behalf and
     running on **their** fleet, on ANY project mode (auto or manual).
     Requires `--owner`; the CLI fails fast without it.
   - `--pr-boundary` — one PR per goal (an integration branch + a single goal
     PR all the goal's code tasks commit onto), instead of a PR per task.
   - `--auto-deliver` — once the goal's PR is review-ready + its deploy gate
     passes, the server auto-merges it. Implies `--pr-boundary`.

   `--parent` and `--blocked-by` accept the same goal-ref shorthand as
   `engine:goal` — `G#<n>` / `#<n>` / bare number / slug / title fragment /
   uuid — resolved client-side before the create.

   On success it prints `Created G#<n> goal "<title>" — <uuid>` plus the
   autopilot outcome: **"Autopilot on"** (the goal was admitted at birth and
   its scoping task spawned) or **"Dormant"** (no scoping task; admit it to
   start). A missing title prints usage and exits 1.

3. **Start a dormant goal** — the create→admit end-to-end flow:
   ```bash
   ibuild engine goal-create "<title>" --dormant
   ibuild engine goal admit <goalId>        # or G#<n> — same ref shorthand
   ```
   `admit` stamps the goal's `admittedAt` (the goal's own started-signal a
   plain GET reflects) and spawns its scoping planning task. See the
   `engine-goal` step for the `admit` verb and how it differs from `resume`.
   You'll also need `admit` on a **manual** (non-AUTO) project, where the
   default `autoAdmit` hint has no effect and the goal lands dormant.

4. **Order multi-goal proposals (G#756).** When proposing SEVERAL related
   goals, declare their ordering: pass `--blocked-by` on each dependent create
   (the goal is born pre-chained), or state explicitly that the goals are
   independent. Unchained related goals get scoped and run by the fleet in the
   wrong order.

## Failure recovery

- **409 duplicate initiative** → a non-terminal goal with the same title
  already exists. Don't retry — find it (`ibuild engine status`) and work it,
  or pick a title that names the genuinely different objective.
- **422** → an invalid `--type`/`--priority` enum, a `--run` without a
  resolvable owner, or an unknown/ambiguous `--repos` token — the server's
  message says which; fix the flag and re-run.
- **`--blocked-by`/`--parent` ref didn't resolve** (no match / ambiguous) → the
  CLI exits BEFORE creating anything; be more specific (use `G#<n>` or the
  uuid) and re-run.
- **`.build/.sync` not found** → this folder isn't linked to a Build project;
  run `ibuild sync` from the project root.

## Notes

- The endpoint is `POST /api/v1/me/engine/goals` — the account-level,
  daemon-token counterpart of the session-only `POST
  /api/v2/projects/{projectId}/goals` the web "New goal" form uses. Required
  body: `projectId` + `title`; the flags above map onto its optional fields.
  Both daemon goal endpoints (this create, and admit —
  `POST /api/v1/me/engine/goals/[goalId]/admit`) are documented in the
  `engine-goal` step, § "Daemon goal endpoints".
- The goal's creator/admitter is the daemon token's OWNER, set server-side from
  the token — the CLI never spoofs an actor.
- This creates the goal (and optionally admits it); scoping happens in the
  spawned `planning` task, and the goal's EngineTasks are then worked with
  `engine:work`. Goal-level decisions (accept / request-changes / pause /
  resume) live in the `engine-goal` step.

### engine-readiness

**When to use:** - The developer asks "is `<repo>` ready for the fleet", "why isn't `<repo>` picking up work", "re-assess `<repo>`", "check `<repo>`'s toolchain/setup". - Before queuing a goal on a newly connected repo, to confirm the fleet can actually run it (a not-ready repo starves its queue). - After fixing an env var / manifest / test mechanism, to re-run the gate. Developers never type this — they say it in natural language and you run the flow.

## Plain English

Inspect and drive a connected repo's **automation readiness + setup** from the
terminal — the CLI counterpart to the web UI's **Fleet setup** driver (project
settings → integrations). Lets the interactive agent see the readiness gate, run
the whole setup pipeline, and adopt a proposed build & test setup without the
browser. Setup is per **connection/repo** — the executing machine is invisible.

Readiness = the five checks a repo must pass before the fleet can run work on it:

1. **toolchain resolved** — a Nix toolchain was detected/declared
2. **test tooling detected** — a test mechanism exists
3. **write access to repo** — the acting GitHub credential can push
4. **install preflight** — dependency install succeeded
5. **services preflight** — declared services came up

All five green ⇒ `ready`.

## When to use

- The developer asks "is `<repo>` ready for the fleet", "why isn't `<repo>`
  picking up work", "re-assess `<repo>`", "check `<repo>`'s toolchain/setup".
- Before queuing a goal on a newly connected repo, to confirm the fleet can
  actually run it (a not-ready repo starves its queue).
- After fixing an env var / manifest / test mechanism, to re-run the gate.

Developers never type this — they say it in natural language and you run the flow.

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` (the web app →
  Settings → Agent Tokens) — the same token the rest of the local engine loop uses.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.
  All the readiness endpoints accept a daemon token OR a browser session.
- Run from the project root (needs `.build/.sync` for the API base URL).

## Steps

1. **List connected repos** (to find the one you mean + its `connectionId`):
   ```bash
   ibuild engine readiness list
   ```

2. **Show the readiness gate** for a repo:
   ```bash
   ibuild engine readiness status <owner/repo | repo-substring | connectionId>
   ```
   - Prints each of the five checks (`✓` pass / `✗` fail / `?` not yet determined),
     the overall `ready` verdict, `preflightStatus`, and any failing check's detail.
   - Exit code is `0` when ready, `1` otherwise (handy in scripts).

3. **Re-assess** — request a fresh read-only assessment on an idle fleet agent and
   poll until it settles:
   ```bash
   ibuild engine readiness assess <owner/repo | repo-substring | connectionId>
   ```
   - `blocked_no_compute` ⇒ no daemon machine is online+idle; bring one up and retry.
   - Otherwise it polls (~2 min) and prints the final gate. This is the CLI form of
     the panel's **Re-assess** button.

## Driving the setup lifecycle

`status` / `assess` cover inspect + re-assess. The **Fleet setup** driver's action
button maps to these subcommands, all **connection-scoped** (no machine id needed):

4. **Set it up / Fix setup / Re-check** — run the whole setup pipeline (re-assess,
   reopen or create the setup goal, redraft build & test), then poll the gate:
   ```bash
   ibuild engine readiness setup <owner/repo | repo-substring | connectionId>
   ```
5. **Use this setup** — adopt the proposed build & test setup (accept the draft):
   ```bash
   ibuild engine readiness accept <repo>
   ```
6. **Regenerate** — throw the current draft away and redraft:
   ```bash
   ibuild engine readiness regenerate <repo>
   ```

All three are the CLI form of the panel's inline actions. Under the hood they POST
`/api/v1/me/connected-repos/:connectionId/test-mechanism` with an `action` of
`recheck | accept | regenerate` — the daemon token works, e.g.:

```bash
curl -s -X POST "$BASE/api/v1/me/connected-repos/$CONNECTION_ID/test-mechanism" \
  -H "Authorization: Bearer $PM_DAEMON_TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"recheck"}'
```

Resolve `$CONNECTION_ID` from `ibuild engine readiness list`; `$BASE` is the
`BUILD_SYNC_URL` in `.build/.sync`.

## Notes

- **Identifier resolution:** exact `owner/repo` > exact `connectionId` >
  unique case-insensitive repo substring. An ambiguous substring prints the
  candidates and does nothing — use the full `owner/repo`.
- Readiness + setup are recorded per **connected repo**, not per machine, so every
  subcommand is machine-independent — which agent runs the work is invisible.
- Read-only for `list`/`status`; `assess`/`setup` mark the profile `pending` for a
  fleet agent to drain (they never run the toolchain in-process).
- Related: the `engine-status` step (task lifecycle), the `engine-work` step (run a task).

### engine-report

**When to use:** - Someone says "report the run", "mark this phase done", "I finished the work", or "release this run" — for a run opened with `engine:claim` / `engine:work`. Developers never type this — they say it in natural language and you run the flow on their behalf (see `.build/CLAUDE.md` §3).

## Plain English

Report the outcome of the run you're working — the step that drives the task
forward. After you've done a phase's work in your AI coding session (and submitted the
deliverable with `pm_submit_artifact`), this says the run is done; the server
advances the task to the next phase, completes it, or pauses it. On a terminal
report it clears `.tasks/.engine` so the next claim isn't blocked.

It's the shared completion step for both `engine:claim` (next in the queue) and
`engine:work` (a task you named).

## When to use

- Someone says "report the run", "mark this phase done", "I finished the
  work", or "release this run" — for a run opened with `engine:claim` /
  `engine:work`.

Developers never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites

- A claimed run: `.tasks/.engine` is present (written by `engine:claim` /
  `engine:work`). The runId is read from it.
- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…`.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.

## Steps

1. **Report success** (drive the task forward):
   ```bash
   ibuild engine report
   ```
   Prints what happened — advanced to the next phase, completed, or paused
   (risk / kickback / review-standoff / operator-action / clarification → resolve
   on `/attention`, or `engine:approve` when it's waiting for plan sign-off). A `clarification`
   pause carries whatever `pm_ask_question` sent it — write that question for a
   non-technical decision-maker (see the `engine-work` step's "Asking a human" note) so the
   `/attention` card is readable, not just triggerable.

2. **Release** a stuck/abandoned run back to the queue instead:
   ```bash
   ibuild engine report --fail "reason"
   ibuild engine report --abandon       # --fail with a default reason
   ```

## Reporting a friction problem — not the same as reporting the run's outcome

`engine:report` (above) tells the engine a PHASE finished — success or failure. A
**friction report** is different: it says "something about the engine itself got in
my way," and it's how a session lives up to `.build/CLAUDE.md` §4 ("not a question
for a human") — a missing credential, a 401/403, a stuck lease, a bridge 409, a
stale worktree are infrastructure failures to REPORT, not decisions to ask a human
about, and not something to silently work around.

- **`pm_report_issue`** (bridge tool) — available in every phase, run or not. Call
  it the moment you hit the friction, with a short `title` and whatever you know:
  `body`, `goalId`, `refusalCode`, `signature`, `command`.
- **`ibuild engine report-issue "<title>"`** — the terminal equivalent, for when
  there's no bridge (or you're scripting). Same flags: `--body`, `--goal`,
  `--fingerprint`, `--refusal-code`, `--signature`, `--command`, `--run-id`,
  `--auto`.

Either one files a deduplicated report on the Build project via a server-side
cross-tenant hop — this session never needs its own access to Build. A repeated
filing of the same fingerprint (or the same `refusalCode`/`signature`/`command`)
REFRESHES one row instead of creating a duplicate, and unless this repo's own
`.build/.config.json` sets `report_issues_local_copy: false`, a linked copy also
lands on this project's own board so you can see it was filed.

This is filing FEEDBACK, not a goal — it never opens a goal or a PR by itself.

## Notes

- The deliverable artifact (e.g. `pr_ref` / `plan` / `acceptance_criteria` /
  `decision_record`) is submitted **during** the session via the bridge's
  `pm_submit_artifact`, not by this command — `engine:report` only reports the
  run's outcome.
- Abandoned interactive runs are also auto-recovered by a server-side reaper
  , so you don't strictly have to `--fail` a run you walked away
  from — though doing so is immediate.
- After a terminal report, `engine:finish` tidies `.tasks/.current` and (with
  `--worktree`) a manual worktree.

### engine-report-issue

**When to use:** - You hit a stuck interactive lease, a bridge tool that 409s, a refusal you don't understand, or a capability that seems to be missing entirely. - The friction isn't blocking the current task badly enough to fail the run over, but it's worth someone fixing. - You're about to write a private workaround instead of telling anyone — don't; file it here first. Prefer the bridge tool `pm_report_issue` when an AI coding session with the PM bridge is available (it's advertised in every phase, run or not); use this CLI form when there's no bridge, or when scripting.

## Plain English

File a **friction report** — a stuck lease, a bridge 409, a confusing refusal, a
missing capability — as a deduplicated Feedback report on the Build project, via a
server-side cross-tenant hop. This session never needs its own access to Build.
`.build/CLAUDE.md` §4 is why this exists: an infrastructure failure is something
to REPORT, not a question for a human and not something to silently work around.

Not the same as the `engine-report` step, which reports a RUN's outcome (success /
`--fail`). This command reports a problem with the ENGINE ITSELF, independent of
whether the current run succeeds or fails.

## When to use

- You hit a stuck interactive lease, a bridge tool that 409s, a refusal you don't
  understand, or a capability that seems to be missing entirely.
- The friction isn't blocking the current task badly enough to fail the run over,
  but it's worth someone fixing.
- You're about to write a private workaround instead of telling anyone — don't;
  file it here first.

Prefer the bridge tool `pm_report_issue` when an AI coding session with the PM bridge
is available (it's advertised in every phase, run or not); use this CLI form when
there's no bridge, or when scripting.

## Prerequisites

- `.build/.sync` present (run `ibuild sync` from the project root if not).
- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…`, OR — for a
  fleet run that holds no daemon token — the project sync token already in
  `.build/.sync` (create-only; a sync-token-only caller can file but never list).

## Steps

### 1. File it

```bash
ibuild engine report-issue "engine:goal take 409s on a fresh worktree"
```

Add whatever you know — none of these are required:

```bash
ibuild engine report-issue "<title>" \
  --body "what happened, what you expected, any error text" \
  --goal <goalRef> \
  --refusal-code <code> --signature <token> --command "<the command that failed>" \
  --fingerprint <token> \
  --run-id <id>
```

`--goal` accepts the same `G#<n>` / `#<n>` / bare `<n>` / slug / title-fragment /
uuid shorthand as `engine:work` — resolved against THIS project before filing.

### 2. Read the result

```
[engine-report-issue] Filed on Build — <id> (occurrence 3, 2 org(s))
[engine-report-issue] Local copy — <id>
```

`occurrence` and `org(s)` mean this exact problem (by fingerprint) was already
seen — the row was refreshed, not duplicated. The **local copy** lands on this
project's own board too, unless `.build/.config.json` sets
`report_issues_local_copy: false`.

## Dedup — how "the same problem" is decided

In order: an explicit `--fingerprint`, else `--signature`, else `--refusal-code`,
else the title — paired with the normalized `--command`. Filing the identical
combination twice (from the same org or a different one) refreshes one row.

## Failure recovery

- **`.build/.sync not found`** — this folder isn't linked to a Build project. Run
  `ibuild sync` from the project root.
- **Missing / rejected credential** — mint a daemon token (PM web UI → Settings →
  Agent Tokens) and put it in `.env.local`, or check `.build/.sync`'s
  `BUILD_SYNC_TOKEN` if this is a fleet run.
- **503 "temporarily paused fleet-wide"** — the fleet-wide stop
  (`ENGINE_SESSION_ISSUE_INTAKE_DISABLED`) is up. Nothing was lost; try again
  later, or tell the operator.

## Notes

- This files FEEDBACK, never a goal — it does not open a goal or a PR by itself.
- No client-supplied identity ever reaches the row: the server stamps the
  reporter from the resolved credential, never from the request body.
- Related: the `engine-report` step (report the current run's outcome — different
  question).

### engine-review

**When to use:** - You implemented a task in its `engine:work` worktree and want a review before the goal's PR goes up. - ANY time you'd reach for `/code-review` while work lives in a worktree — use this instead so the review reads the right checkout. - If you are NOT in a worktree (a normal single-clone branch), plain `/code-review` is fine; this command degrades to that case anyway. People say it in natural language ("review my changes", "code review this task") and you run the flow on their behalf.

## Plain English

Run a code review of the **active task's worktree** — correctly. It is the
worktree-aware wrapper around the `/code-review` plugin.

`/code-review` resolves its diff and its file reads against the **current working
directory**. This flow breaks that assumption: `engine:work` puts your changes in
a **sibling git worktree**, but the session's cwd usually stays on your main
checkout (often a stale or detached default branch). Run `/code-review` from
there and its finder sub-agents read the *wrong checkout* — they "discover" that
your new imports or params are missing because they're looking at code that
predates your change.

This step fixes that by (1) resolving the worktree under review, (2)
fetching and diffing against `origin/<default>` (so a stale local base can't
skew the range either), and (3) handing `/code-review` an **absolute** review
root so every finder and verifier reads the worktree, never the primary clone.

## When to use

- You implemented a task in its `engine:work` worktree and want a review before
  the goal's PR goes up.
- ANY time you'd reach for `/code-review` while work lives in a worktree — use
  this instead so the review reads the right checkout.
- If you are NOT in a worktree (a normal single-clone branch), plain
  `/code-review` is fine; this command degrades to that case anyway.

People say it in natural language ("review my changes", "code review this
task") and you run the flow on their behalf.

## Steps

1. **Resolve the worktree under review (`WT`).** In priority order:
   - **An explicit argument** (`#N` / branch / path) → that target. For `#N`,
     resolve the task (`ibuild engine status #N`), derive its branch, and
     match it in `git worktree list`.
   - **cwd is already a linked worktree** → review it. Detect with:
     ```bash
     [ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ] && echo "in a worktree"
     ```
   - **Otherwise, find it** from the worktree list. This prints `branch  ->  path`
     for every branch-linked worktree (the detached entry is the primary clone and
     is skipped):
     ```bash
     git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{sub("refs/heads/","",$2); print $2"  ->  "w}'
     ```
     If the active task is known (the `engine:work` you just ran, or
     `.tasks/.current` in a worktree), match its `task/<slug>` / `goal/<id>`
     branch. If several worktrees are plausible and you can't tell which, **list
     them and ask** — never guess.

   Capture the absolute root and the base branch:
   ```bash
   WT="$(git -C <the-worktree-or-cwd> rev-parse --show-toplevel)"
   DEFAULT="$(git -C "$WT" rev-parse --abbrev-ref origin/HEAD 2>/dev/null | sed 's#^origin/##')"
   DEFAULT="${DEFAULT:-main}"
   ```

2. **Refresh the base + scope the diff.** Fetch so the range can't be skewed by a
   stale local `main`, then show what's under review:
   ```bash
   git -C "$WT" fetch origin "$DEFAULT" --quiet
   git -C "$WT" --no-pager diff "origin/$DEFAULT...HEAD" --stat
   ```
   If the diff is empty, say so and stop — there's nothing to review.

3. **Run `/code-review`, pinned to the worktree.** Invoke the `/code-review`
   skill at the requested effort (default `high`), but prepend this **directive**
   and follow it for every finder and verifier you spawn:

   > **Review root (absolute): `$WT`.** The session cwd may be a *different*
   > checkout — do NOT trust it. Scope the review to
   > `git -C "$WT" diff origin/$DEFAULT...HEAD`. Every finder and verifier MUST
   > Read files by **absolute path** under `$WT/` (e.g. `$WT/src/lib/foo.ts`),
   > never relative paths, and must generate any diff only via `git -C "$WT" …`.
   > A finding that depends on a file's contents is INVALID unless it was read
   > from `$WT`.

   This is the load-bearing step: a finder sub-agent starts in the primary clone,
   so only an absolute `$WT` path guarantees it reads the code you actually
   changed.

4. **Apply / report** as usual for `/code-review` (e.g. `--fix`, `--comment`).
   Cross-check surviving findings against your project's own typecheck command
   (`typecheck_command` in `.build/.config.json`) + the test suite **in the
   worktree** before trusting "missing symbol" style findings — that catch is
   what exposed the wrong-checkout reads on #1062. If the repo declares no
   typecheck command, its test suite alone is the cross-check.

## Notes

- **Why not just `cd` into the worktree?** Because `/code-review`'s finder
  sub-agents don't inherit the parent's transient cwd — they start in the
  session's primary directory. `cd` fixes the main loop's own `git diff`, but
  only an **absolute `$WT` path** fixes the finders. This command does both.
- **Base branch.** `origin/<default>` (resolved from `origin/HEAD`, fallback
  `main`) — the same base the PR will use. Fetching first also fixes the
  *stale-local-base* trap (a primary clone parked on an old/detached `main`).
- **Not in a worktree?** Step 1 falls through to cwd; the command behaves like a
  normal current-branch `/code-review` — no worse than today.
- **Scope.** This wraps the existing `/code-review` plugin; it does not
  re-implement review methodology. If the upstream plugin ever roots its reads at
  the diff target's toplevel, this wrapper becomes unnecessary.

### engine-status

**When to use:** - Someone asks "what's the status of task #N", "where is <slug>", "is <task> blocked / paused / done". - Before `engine:work` / `engine:approve` / `engine:report`, to check the task's current phase + whether it's waiting on a pause. Developers never type this — they say it in natural language and you run the flow on their behalf (see `.build/CLAUDE.md` §3).

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

### engine-watch

**When to use:** - Someone asks "watch G#N", "tell me when G#N pauses / its PR merges / CI moves", "wait for the next event on <goal>". - As an **agent wake-trigger**: run `--wait` (or its explicit alias `--supervise`) as a `run_in_background` step in place of a poll timer. The wake-trigger DEFAULTS to the **actionable** event filter (a goal blocked / becoming acceptable / delivered / accepted / requeued / gate-flip) and exits 0 on the first one, then you re-fetch current state (`engine:status`) and act. It deliberately does NOT fire on the high-frequency `task:progress` build churn, and — crucially — it INCLUDES `goal.ready_to_accept`, so a supervisor can't silently miss a goal becoming acceptable. To wake on EVERY event (the old fire-hose, incl `task:progress`), opt in explicitly with `--all-events`.

## Plain English

Stream a **goal's** live lifecycle events over SSE instead of polling for them. You
name the goal by identifier (`G#N`, `#N`, slug, title fragment, or UUID); this
subscribes once to the events the server already pushes on `/api/sse/me`, filters to
that goal, and prints a structured line per event — pause opened (+ kind), pause
resolved, PR/CI/deploy-gate change, `pr_merged`, phase/admission advance.

This is the push-driven replacement for the poll loops supervisors hand-roll (a fixed
wake timer, or `curl -N /api/sse/me | grep`). Read-only.

## When to use

- Someone asks "watch G#N", "tell me when G#N pauses / its PR merges / CI moves",
  "wait for the next event on <goal>".
- As an **agent wake-trigger**: run `--wait` (or its explicit alias `--supervise`) as a
  `run_in_background` step in place of a poll timer. The wake-trigger DEFAULTS to the
  **actionable** event filter (a goal blocked / becoming acceptable / delivered / accepted /
  requeued / gate-flip) and exits 0 on the first one, then you re-fetch current state
  (`engine:status`) and act. It deliberately does NOT fire on the high-frequency
  `task:progress` build churn, and — crucially — it INCLUDES `goal.ready_to_accept`, so a
  supervisor can't silently miss a goal becoming acceptable. To wake on EVERY event
  (the old fire-hose, incl `task:progress`), opt in explicitly with `--all-events`.

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` (the web app → Settings
  → Agent Tokens) — the same token every `engine:*` CLI uses. `/api/sse/me` and
  `/api/v1/me/engine/tasks/:id` both accept it.

## Steps

1. **Supervise a goal** — the recommended wake-trigger. Run backgrounded; it stays quiet
   until the goal blocks / becomes acceptable / delivers / is requeued / unblocks, then
   exits so you re-fetch state and act:
   ```bash
   ibuild engine watch <G#N | #N | slug | title-fragment | uuid> --wait
   ```
   A bare `--wait` DEFAULTS to the actionable event filter (same set as `--supervise`);
   it excludes the high-frequency `task:progress` churn and includes `goal.ready_to_accept`.
   `--supervise` is an explicit alias for the same behavior.
   **Read the exit code before you act.** Exit 0 is a wake (an event matched) — the only
   one. Exit 130 is your own Ctrl-C. Any other **non-zero exit means the watch was BLIND** — it
   could not reach the server for ~10 minutes (exit 3), or it ended without an event (exit 4),
   and it saw no events in that time. That is not a wake: re-check the goal's state (`ibuild engine status`) before
   acting, and restart the watch once the server answers.
2. **Stream a goal** (keeps printing every event until Ctrl-C — for live tailing, not
   an unattended wake):
   ```bash
   ibuild engine watch <goalRef>
   ```
3. **Narrow / widen**:
   - `--wait` — the wake-trigger: exit 0 on the FIRST **actionable** event (defaults to the
     `--supervise` filter — no `task:progress` fire-hose, and `goal.ready_to_accept` is in).
   - `--supervise` — explicit alias for the default `--wait` filter (actionable-only).
   - `--all-events` — RAW opt-in: wake on EVERY event incl the `task:progress` fire-hose
     (the old bare-`--wait` behavior; implies `--wait`). Can't combine with `--types` /
     `--supervise`. Equivalent to listing `task:progress` in `--types`.
   - `--all` — every goal across the operator's projects (drops coarse, unattributable noise).
   - `--types a,b` — only these event types (can't combine with `--supervise` / `--all-events`):
     `engine:pause`, `engine:pause-resolved`, `task:progress`, `engine.changed`,
     `goal.ready_to_accept`, `goal.pr_merged`, `goal.accepted`, `goal.cancelled`,
     `engine:starvation-requeued`. **A `--types` that omits `goal.ready_to_accept` prints a
     loud startup warning** — it would never wake you when the goal becomes acceptable.
   - `--json` — one JSON object per line, for programmatic consumers.
   - `--help` — full usage + every event type with a one-line gloss (actionable vs churn).

## Notes

- **Push, not replay.** On (re)connect the watcher does NOT replay history — it tells
  you "something changed; go look", and you re-fetch the authoritative state on wake.
- **Reliable goal filter.** Pause events carry only a `taskId`; the watcher resolves
  `taskId → goalId` (immutable, cached permanently) so a goal-scoped filter is exact —
  no substring matching. The PR/CI/deploy-gate reconcile seams are enriched server-side
  to carry the goal id, so those transitions attribute correctly too.
- **Resilient.** Auto-reconnects across stream drops and laptop-sleep gaps (honors the
  30 s SSE heartbeat; reconnects if none arrives within ~70 s).
- **Bounded, and loud when blind.** If reconnecting keeps failing for ~10 minutes with no heartbeat or event — the
  server refuses the connection, answers with an error, or kills each stream after it opens —
  the watch stops retrying and exits **non-zero** with one line naming the server, how long it
  was unreachable, and that it saw no events. Treat that as "blind, re-check state", never as
  a wake.
- Full usage, including every event type with a one-line gloss:
  `ibuild engine watch --help`.

### engine-work

**When to use:** - Someone says "work on task #N", "let's do <slug>", or "pick up <title fragment>". - You want a *specific* task, not "whatever's next in the queue" (that's the `engine-claim` step). Developers never type this — they say it in natural language and you run the flow on their behalf (see `.build/CLAUDE.md` §3).

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

### interactor-design-guide

**When to use:** Apply proactively whenever creating or modifying UI/UX in a project that deliberately matches Interactor server's own visual system. Every new component should pass the design checklist in this guide before it's considered done.

## Purpose
Apply the Interactor design system to all UI/UX components to ensure visual and behavioral consistency with interactor-server. This command enforces design tokens, patterns, and guidelines extracted from the interactor-server codebase.

> **Scope — which design system?** This guide describes the **Interactor server** design system (blue accent `#0062ff`, compact 3–8px radii). If your project has its own design system — its own palette, spacing scale, and components — follow that instead; reach for this guide **only** when you are deliberately matching Interactor server visuals.

## Design Guide Reference
**Primary Reference**: the Interactor design-system reference, mirrored in this skill (the tokens and patterns below are the canonical copy — no machine-specific path required).

This guide contains:
- Complete color palette with CSS variables
- Typography specifications (fonts, sizes, weights)
- Component patterns (buttons, forms, navigation, messages)
- Spacing, borders, and layout standards
- Transitions and animations
- Accessibility requirements
- Component checklist

## When to Use

### Automatic Activation
This command should be referenced whenever:
- Creating new UI components
- Modifying existing UI/UX elements
- Implementing new pages or layouts
- Adding interactive elements (buttons, forms, inputs)
- Styling components or templates

### Manual Invocation
```bash
/interactor-design-guide [component-type] [--validate] [--apply] [--report]
```

## Core Design Tokens

### Colors (CSS Variables)
```css
/* Primary Accent */
--accent-500: #0062ff;        /* Main brand color */
--accent-50: #e6efff;         /* Selected states */
--accent-300: #66a1ff;        /* Hover states */

/* Backgrounds */
--background-1: #ffffff;      /* White */
--background-2: #f9fafb;      /* Light gray */
--background-4: #ecf0fe;      /* Light blue */

/* Text Colors */
--color-11: #494f5c;          /* Dark gray text */
--color-9: #8f92a1;           /* Gray text */

/* Borders */
--border-1: #d3d6da;          /* Border gray */

/* Status Colors */
--red-500: #ef4444;           /* Errors */
--green-500: #22c55e;         /* Success */
```

### Typography
```css
/* Base */
font-size: 14px;              /* Root font size */

/* Weights */
font-weight: 500;             /* Default */
font-weight: 600;             /* Inputs */
font-weight: 700;             /* Bold/Selected */
```

### Spacing
```css
/* Border Radius */
border-radius: 3px;           /* Small (nav, buttons) */
border-radius: 8px;           /* Large (core buttons) */

/* Padding */
padding: 0.5rem 1.2rem;       /* Buttons, messages */
padding: 0.625rem 1rem;       /* Navigation */

/* Margins */
margin-bottom: 16px;          /* Navigation options */
```

## Component Standards

### Buttons
```css
/* Primary Button */
background: var(--accent-500);
color: white;
border-radius: 8px;
padding: 0.5rem 1.2rem;
font-weight: 500;
transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);

/* Hover */
background: var(--accent-600);

/* Secondary Button */
background: var(--accent-50);
color: var(--accent-500);
border: 1px solid var(--accent-500);
```

### Form Inputs
```css
border: 1px solid var(--border-1);
border-radius: 4px;
padding: 0.5rem 0.75rem;
font-weight: 600;

/* Focus */
border-color: var(--accent-500);
outline: 2px solid var(--accent-100);
outline-offset: 2px;

/* Placeholder */
color: var(--placeholder-color);
```

### Navigation
```css
/* Default */
background: var(--background-1);
transition: all 150ms;

/* Hover */
background: var(--background-2);
color: rgb(107 114 128);
border-radius: 3px;

/* Selected */
background: var(--accent-50);
color: var(--accent-500);
```

## Execution Workflow

### 1. Read Design Guide
Review the Interactor design-system reference (the tokens, component standards, and checklist documented in this skill) for the complete specifications.

### 2. Analyze Target Component
- Identify component type (button, input, card, navigation, etc.)
- Determine component states (default, hover, focus, disabled, loading)
- Review required interactions and animations

### 3. Apply Design Tokens
- Use CSS variables instead of hardcoded colors
- Apply standard border radius values (3px, 4px, 8px)
- Use consistent font weights (500, 600, 700)
- Implement standard spacing (0.5rem, 1rem, 1.5rem)
- Add transitions (150ms cubic-bezier)

### 4. Implement States
- **Hover**: Background change + transition
- **Focus**: Accent-500 outline with 2px offset
- **Disabled**: Gray-300 background, 0.6 opacity, cursor not-allowed
- **Loading**: Pulse animation
- **Error**: Red-500 border/background
- **Success**: Green-500 border/background

### 5. Accessibility Check
- [ ] WCAG 2.1 AA color contrast ratios (4.5:1 minimum)
- [ ] Keyboard navigation support
- [ ] Focus indicators visible
- [ ] ARIA labels where needed
- [ ] Semantic HTML structure

### 6. Validate Implementation
Compare against design guide checklist:
- [ ] Colors: CSS variables from palette
- [ ] Typography: 14px base, weights 500/600/700
- [ ] Spacing: Consistent margins and padding
- [ ] Borders: Radius 3-8px, color --border-1
- [ ] Buttons: 8px radius, accent-500 background
- [ ] Icons: 40px navigation, 20px inline (Heroicons)
- [ ] Transitions: 150ms cubic-bezier
- [ ] All interactive states implemented
- [ ] Accessibility requirements met

## Arguments

### `[component-type]` (Optional)
Specify the type of component being created/modified:
- `button` - Button components
- `input` - Form input fields
- `navigation` - Navigation menus and options
- `card` - Card/container components
- `message` - Toast/notification messages
- `toggle` - Toggle switches
- `checkbox` - Checkbox inputs
- `modal` - Modal dialogs
- `table` - Data tables

### `--validate` (Flag)
Validate existing components against design guide:
- Scan for hardcoded colors (should use CSS variables)
- Check border radius consistency
- Verify font weight usage
- Identify missing interactive states
- Report accessibility issues

### `--apply` (Flag)
Automatically apply design system to components:
- Replace hardcoded colors with CSS variables
- Standardize border radius values
- Fix font weights to standard values
- Add missing interactive states
- Implement standard transitions

### `--report` (Flag)
Generate design compliance report:
- List compliant components
- Identify non-compliant components
- Suggest fixes for violations
- Provide implementation examples

## Examples

### Create New Button
```bash
/interactor-design-guide button --apply
```
Creates a button component with:
- `accent-500` background
- White text
- 8px border radius
- Standard padding and transitions
- All interactive states (hover, focus, disabled)

### Validate Existing Form
```bash
/interactor-design-guide input --validate
```
Validates form inputs against:
- Correct border styles and colors
- Proper font weights
- Focus state implementation
- Placeholder color usage

### Apply Design to Navigation
```bash
/interactor-design-guide navigation --apply
```
Applies navigation patterns:
- Selected state styling (accent-50 background)
- Hover state (background-2)
- Icon color filters
- Smooth transitions

### Full Compliance Report
```bash
/interactor-design-guide --report
```
Generates report covering:
- Color palette compliance
- Typography consistency
- Component state completeness
- Accessibility status

## Integration with Existing Commands

### Works with /sc:implement
When implementing new features with UI components:
```bash
/sc:implement "user dashboard" --persona-frontend
/interactor-design-guide --apply
```

### Works with /sc:design
When designing UI components:
```bash
/sc:design "notification system" --type component
/interactor-design-guide --validate
```

### Works with /sc:improve
When improving existing UI:
```bash
/sc:improve @components/Button.tsx --focus quality
/interactor-design-guide button --apply
```

## Common Patterns

### Pattern 1: New Component Creation
1. Read design guide for component type
2. Extract relevant design tokens
3. Implement component with tokens
4. Add all interactive states
5. Test accessibility
6. Validate against checklist

### Pattern 2: Existing Component Update
1. Scan component for design violations
2. Identify hardcoded values
3. Replace with CSS variables
4. Add missing states
5. Fix accessibility issues
6. Validate compliance

### Pattern 3: Design System Audit
1. Scan all UI components
2. Generate compliance report
3. Prioritize fixes by impact
4. Apply fixes systematically
5. Re-validate after changes

## Best Practices

### Always
✅ Use CSS variables from color palette
✅ Apply standard border radius values (3px, 4px, 8px)
✅ Implement all interactive states
✅ Add 150ms transitions
✅ Test keyboard navigation
✅ Verify color contrast ratios
✅ Use semantic HTML
✅ Include ARIA labels

### Never
❌ Hardcode hex colors
❌ Use custom border radius values
❌ Skip hover/focus/disabled states
❌ Use transitions > 400ms
❌ Forget loading states
❌ Ignore accessibility
❌ Mix inconsistent font weights

## Troubleshooting

### Issue: Colors don't match
**Solution**: Ensure CSS variables are imported from `colors.css` and used instead of hardcoded values.

### Issue: Transitions feel slow
**Solution**: Use standard 150ms transition with cubic-bezier(0.4, 0, 0.2, 1) timing function.

### Issue: Focus states not visible
**Solution**: Apply 2px outline with accent-500 color and 2px offset.

### Issue: Component looks different on hover
**Solution**: Ensure hover state uses background-2 or accent-300 depending on context.

## Design System Files

### Reference Files
The canonical source for these tokens lives in the interactor-server UI assets (the
`assets/css/` stylesheets — `colors.css`, `core_components.css`, `root.css` — and the
`tailwind.config.js`). Consult them in a checkout of interactor-server when you need
the upstream source of truth; the tokens and patterns in this skill mirror them.

### Design Guide
- **Complete Guide**: the Interactor design-system reference mirrored in this skill (sections above).

## Notes

- This guide should be applied **proactively** whenever creating or modifying UI/UX
- Design consistency is a **non-negotiable quality requirement**
- All new components must pass the design checklist before completion

---

**Quick Reference**: Use the `interactor-design-guide` step before implementing any UI/UX to ensure consistency with interactor-server design system.

### ship

**When to use:** - You (or your AI coding session) finished work with uncommitted changes, or already pushed a branch ahead of the default branch, and want it tracked and shipped as a goal without hand-driving goal-create/take/gh-pr-create/link-pr yourself. - You want the fast on-ramp into Build from ANY tool that can run `git push` — this is the one path that works the same regardless of which AI coding tool (or none at all) produced the work. - You are NOT already mid-goal in this session (see `.build/CLAUDE.md` §3) — ship is for work that has no goal yet.

## Plain English

Turn a working tree full of changes — or a branch already pushed ahead of the
default branch — into a goal, with no manual `goal-create --pr-boundary` /
`gh pr create` / `goal link-pr` dance. Commits any uncommitted changes (with
your confirmation), pushes to `ship/<user>-<short-sha>` (or a branch you
name), then adopts that push as a **PR-boundary goal** — built for a moment
in human mode so nothing else can claim it mid-construction, then handed
straight back to agent mode with one review task already queued — a linked
PR already open, ready for the normal review → CI → delivery-queue path.

Unlike every other command in this catalog, `ship` is a **top-level**
`ibuild` verb — `ibuild ship`, a sibling of `ibuild engine`, not one of its
subcommands — so it can run before any goal exists at all, and does not
belong under the goal-lifecycle family. The whole server-side sequence
(verify the pushed SHA descends from the default branch, create the goal,
cut the branch, open and link the PR, seed one review task) is one
transaction; this command's own job is only to commit, push, and call it.

## When to use

- You (or your AI coding session) finished work with uncommitted changes, or
  already pushed a branch ahead of the default branch, and want it tracked
  and shipped as a goal without hand-driving goal-create/take/
  `gh pr create`/link-pr yourself.
- You want the fast on-ramp into Build from ANY tool that can run
  `git push` — this is the one path that works the same regardless of which
  AI coding tool (or none at all) produced the work.
- You are **not** already mid-goal in this session (see `.build/CLAUDE.md`
  §3) — `ship` is for work that has no goal yet. A follow-up request inside
  a goal you're already driving belongs on that goal instead (`engine-create`
  under it), not a new `ship`.

## Prerequisites

- `.build/.sync` present (run `ibuild sync` from the project root if not).
- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` — mint
  it in the web app under **Settings → Agent Tokens**.
- Inside a git checkout whose `origin` remote is a repo connected to this
  Build project.

## Steps

### 1. Ship it

From inside the repo, on the branch that has the work (or with the working
tree dirty):

```bash
ibuild ship
```

With no flags, `ship` drafts a title/why from the diff (or, if nothing is
uncommitted, from the last commit) and pushes to `ship/<user>-<short-sha>`.
Override any of that:

```bash
ibuild ship \
  --title "<goal title>" \
  --why "<why this change>" \
  --branch "<push-branch-name>" \
  --criteria "<one acceptance criterion>" \
  --criteria "<another — repeat the flag for more>"
```

- `--branch <name>` is also **required** to ship straight from the default
  branch (`ship` refuses otherwise) — it is the acknowledgment that you mean
  to push a new branch off it, and the name that branch gets.
- `--dry-run` previews the title/why/branch/effects and creates nothing.
- `--yes` / `-y` skips the confirmation prompt (needed outside a terminal —
  e.g. an AI coding session running non-interactively).

`ship` always shows what it is about to do (target repo, whether it's
committing uncommitted files or just pushing already-committed ones, the
push branch, the goal title) and asks for confirmation before writing
anything, the same consent gate every other state-changing `ibuild` command
uses.

### 2. Read the result

```
✓ Shipped. https://build.interactor.com → Goals → G#<n>
  PR: https://github.com/<owner>/<repo>/pull/<n>
```

The goal is created briefly in human mode while it's being assembled (so
nothing can claim it mid-construction), then immediately handed back to
Build's own automation — by the time `ship` prints this result, the goal is
a normal **agent-mode, PR-boundary goal** with its review task already
queued, going through the ordinary review → CI → delivery-queue path like
any other goal. Open the PR link to see the diff, or check
`engine-goal status <n>` to watch its progress — there is nothing to pick up
or drive yourself.

## Failure recovery

- **"Refusing to ship from the default branch"** — pass `--branch <name>` to
  acknowledge it and choose the branch name to push as.
- **"Nothing to ship"** — no uncommitted changes and no commits ahead of the
  default branch; there is nothing for `ship` to do here.
- **Push failed** — a plain git push error (auth, remote rejected, etc.);
  fix what git reports and re-run.
- **Pushed, but could not reach Build to create the goal** — the branch is
  already safe on the remote; re-run `ibuild ship --branch <the same branch>`
  once the connection is back rather than pushing again.
- **Pushed, but adopting it as a goal failed** — same recovery: the push
  already happened, so re-run with the same `--branch` once the reported
  error (an invalid `--criteria`, a repo not connected to this project, etc.)
  is fixed, instead of pushing a second time.
- **`.build/.sync` not found** — this folder isn't linked to a Build
  project; run `ibuild sync` from the project root.

## Notes

- `ship` takes no positional argument — everything is a flag.
- The pushed branch is never rewritten or force-pushed; `ship` only ever
  pushes the ref it just created.
- The created goal has a **PR boundary** already in place, so there is no
  separate `--pr-boundary` flag to remember and no `link-pr` step to run by
  hand — this is precisely the failure class the older hand-driven sequence
  used to hit (an accepted goal with no PR ever linked; see the CLI-goal-
  without-pr-boundary gotcha in this repo's own runbooks). It is only ever
  **human-mode** for the moment it's being assembled — by the time `ship`
  returns, it has already been handed back to agent mode and its review task
  is queued for the fleet, not parked for you.
- Related: `engine-goal-create` mints a goal from a description with no code
  yet written; `ship` is for the opposite direction — code already exists,
  and the goal is minted FROM it.

<!-- END BUILD WORKFLOW COMMANDS -->