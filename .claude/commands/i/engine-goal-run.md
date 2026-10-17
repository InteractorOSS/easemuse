---
name: engine-goal-run
version: "1.3.0"
description: Work one goal in this session — or hand several goals (or a group) to `ibuild engine goal run`, which builds them on this computer, several at a time when that is safe.
---
# /engine-goal-run

## Plain English

Work on a goal **in this session** — take it so the fleet can't claim it out
from under you, drive it to a reviewable state, stop and show the developer
what changed, then hand the actual merge to the delivery queue instead of
racing a fast-moving `main` by hand. This is the **Build → Preview → Iterate →
Land** loop, spelled entirely as `ibuild engine …` verbs.

Three argument shapes:

- **A goal reference** (`G#123`, `123`, a slug, or a goal id) → go straight to
  step 2 (status), then step 3 (take).
- **SEVERAL goal references, or a group** → do not work them here. Hand the
  whole list to `ibuild engine goal run` — see *Several goals at once* below.
- **A description** of what to build or fix → check *Step 0.5* first — a
  follow-up request in a session already working a goal usually belongs on
  that goal, not a new one.

## When to use

- "work on goal N", "let's do <name>", "fix X" (with no goal open yet).
- The developer wants YOU driving the implementation this session, not the
  fleet — the goal must never be `queue`d or `resume`d while this runs.

## Several goals at once

When the developer names more than one goal — or a group — run this, from the
project root, and let it do the rest:

```bash
ibuild engine goal run G#3296 G#3309 G#3166      # the goals they named
ibuild engine goal run G#3174                    # a group: runs its parts
ibuild engine goal run G#3296 G#3309 --dry-run   # the plan, taking nothing
```

What it does, so you do not have to:

- **Refuses, in plain words**, any goal that has shipped, was closed, is paused,
  or is already being built by somebody else.
- **Offers the goals that belong with the ones they named** — same group, a
  dependency either way, an overlapping file list, the same feature — and
  **asks** before adding any. It never adds one on its own, and it never
  touches a goal nobody named.
- **Decides what can run at the same time.** Goals whose plans change the same
  files, or that wait for one another, run in order; the rest run side by side,
  as many as this computer's processors, memory and free disk allow. A goal
  with no plan yet runs on its own, because what it changes is not yet known.
- **Gives every goal a fresh session for every task phase** — investigation,
  execution, and each review round — in its own worktree, the same way a fleet
  machine works it: each phase starts clean, picking up from the short hand-over
  note the phase before it left in that goal's own `.goals/handover.md`, instead
  of the previous phase's whole conversation. A session that crosses a context
  ceiling (250k tokens by default; `--context-ceiling <n>` to change it)
  restarts fresh for the SAME phase at the next safe milestone — never mid-gates
  — so a long-running goal never drags a bloated conversation into its next
  step. Every one of these sessions launches on Sonnet unless overridden, in
  order, by `--model`, `ANTHROPIC_MODEL`, or `~/.claude/settings.json`'s
  `model` field.
- **Hands each goal off** with `land --no-watch` when it is ready, and shows one
  line per goal on a board: what it is doing now, how long it has been at it,
  and how many sessions/how much context it has used so far (e.g.
  `checks running · session 3 · 140k`).

Two things it deliberately does not do: it never watches CI or the merge queue
after a hand-off, and it never bypasses permissions. `--max <n>` lowers how
many run at once; `--follow <goal>` also prints that one goal's progress lines.

**This does not make one session drive two goals.** Every goal still gets its
own session — that rule (below) is what the verb is built out of, not an
exception to it.

### Waiting for the run to end — the exit is the event

The runner exits on its own when it is done, so **its exit is the event you
wait for**. Start it as a **background step your tool tracks** — one that
wakes this session when the command exits:

```bash
ibuild engine goal run G#3296 G#3309 > goal-run.log 2>&1; echo "goal-run exit=$?"
```

Never start it with `nohup`, `&`, `disown` or `setsid`. A detached process
belongs to nobody, so its exit never reaches the session.

**The exit can come seconds after the start.** If any named goal is refused
(shipped, closed, paused, already being built by somebody else), the runner
prints one `[engine-goal] …` line and exits 1 before it prints any board or
`All done.`. Treat that wake like any other: read the line, then read status.

**What the exit code tells you, and what it does not:**

- `0` — every goal was handed off **or is waiting on a person** (`needs_you`).
  An exit 0 does not mean every goal was handed off.
- `1` — a goal was refused before the run started, or at least one goal
  failed (including a goal that could not start because the disk was too full).

**The outcome of record is `ibuild engine status <goal>`, for EVERY goal you
named.** The log is only a hint: each board redraw is appended to it as new
lines, followed by `All done.` and a final board, and its wording can change.
Never grep it to decide whether a goal was handed off, refused or failed.

```bash
ibuild engine status G#3296
ibuild engine status G#3309
```

**A kill notification, or a resumed session, means the outcome is unknown.**
Re-read `ibuild engine status` for every goal. Never assume the run is still
going, and never assume it finished well.

**To start a goal that must wait for another one to merge**, wait on the merge
inside the session, never in a detached helper:

1. Run `ibuild engine watch <goal> --wait` as a tracked background step. It
   stays quiet until the goal needs you or moves on, then exits.
2. When it wakes you, read `ibuild engine status <goal>`.
3. Once it has merged, start the next `ibuild engine goal run` as a tracked
   background step again.

**Rejected patterns, and why:**

- **A `tail -f` / `tail -F` + grep watcher as the only signal.** `tail` never
  exits, so the run ending is never an event; a missed line or a killed
  watcher leaves the session asleep for good.
- **Timed polling** (sleep loops, scheduled wake-ups). It is polling, which
  push-not-poll forbids, and it notices an ended run late.
- **A helper that does not outlive the session** (a detached watcher or
  poller). It disappears with the session, and the next goal never starts.

## Prerequisites (one-time)

Same as every engine command: `PM_DAEMON_TOKEN` in `.env.local`, run from the
project root or below. See the engine-work step if this is the first command
run in a fresh checkout.

## Step 0.5 — already working a goal this session?

Before treating a request as a brand-new objective, check whether this session
is already bound to one (see the engine-active-goal step):

```bash
ibuild engine active-goal status
```

- **Nothing bound** → skip to step 1.
- **A goal IS bound and its worktree is still open** → classify what this
  request would touch — mechanical, never a judgement call:

  ```bash
  ibuild engine active-goal check-scope <path> [path...]
  ```

  - **"ALWAYS a new goal"** (schema/migration, API route, engine/daemon wire
    contract, auth, or billing) → say which reason fired, then fall through to
    step 1 as a genuinely new goal.
  - **"clear"** → the remaining question is judgement: does this fit the bound
    goal's stated objective? If yes: stay in the same worktree, add a task
    under the bound goal instead of a new goal (`ibuild engine create "<task
    title>" --goal <goalId>`), fold the added scope into the goal's own
    description (`ibuild engine active-goal grow --add "<what this adds>"`,
    plus `--done-when "<updated criteria>"` if the acceptance bar moved), then
    go straight to step 5 in the existing worktree. If it's a different
    feature area, say so and fall through to step 1.

## Step 1 — look for an existing goal before creating one

Never create a duplicate.

```bash
ibuild engine goals
```

Match on intent, not exact title (see the engine-goals step).

- **Found one** → report its state (`ibuild engine goal status <goalId>`) and
  reuse it. If it is already delivered or accepted, say so and STOP — do not
  reopen it.
- **None** → create it (step 1.5).

## Step 1.5 — create it

```bash
ibuild engine goal-create "<title>" --desc "<what>" --why "<why>" \
  --done-when "<acceptance>" --type <feature|bug|chore> --priority <low|medium|high> \
  --repos <owner/repo> --dormant
```

`--dormant` is required: the goal is born task-less, so nothing spawns before
it is taken. Write a real description — this is the durable record, not this
session's scratch notes.

## Step 2 — read its state

```bash
ibuild engine goal status <goalId>
```

Already `accepted` or `delivered`? Say so and STOP.

Then read what is attached to it — a spec or mockup means the written
description is deliberately incomplete (see the engine-goal-files step):

```bash
ibuild engine goal-files <goalId>
```

## Step 3 — check nobody else already has it, then take it

`ibuild engine goal take` itself refuses a goal that is already being driven —
by a different human-mode session, by a live interactive run lease that isn't
this session's, or by a fleet machine currently running it — naming who or
what is on it instead of silently stealing the goal out from under them:

```bash
ibuild engine goal take <goalId>
```

Flips the goal to human-driven and refuses fleet claims, queue and resume —
stronger than pausing. When the developer has confirmed the other driver
should genuinely be pre-empted (not the default — ask first), override the
refusal explicitly:

```bash
ibuild engine goal take <goalId> --take-over            # pre-empt a human-mode driver
ibuild engine goal take <goalId> --take-over --stop-running   # also end a live fleet run on it
```

A takeover is recorded against the goal either way, so it is never silent.
**Never `ibuild engine goal queue` a goal you intend to hand-drive**: queueing
admits it and invites the fleet back in.

Then bind this session to it, so a later request in the same session finds it
via *Step 0.5* instead of opening a new goal:

```bash
ibuild engine active-goal bind <goalId>
```

## Step 4 — epic? wait out the blockers, then open the worktree

If the goal has a parent goal or is blocked by another one, do not poll —
subscribe:

```bash
ibuild engine watch <blockingGoalRef> --wait
```

It stays quiet until something actionable happens, then exits. Only proceed
once every blocker is delivered.

Then open the run **from the primary clone** — creating a task first if the
goal doesn't have one yet:

```bash
ibuild engine create "<what this task does>" --goal <goalId>   # only if the goal has no task yet
ibuild engine work <taskId>
```

Note the worktree path it prints, and the two lines about which base it used
and whether the seeded dependencies typecheck. Read them before writing code.

If this session has no PM bridge attached, start the keepalive now so a long
stretch of coding does not let the run's lease lapse (see the
engine-heartbeat step):

```bash
ibuild engine heartbeat --loop
```

Run it as a tracked background step; it stops itself when the run ends.

## Step 5 — drive implementation to ready-to-deliver, in this session

Work **inside the worktree** from here on: run every build/test command with
the worktree as the working directory, and read/edit files by absolute path
under the worktree root.

The loop:

1. Implement the change.
2. Record each phase's deliverable — the bridge's `pm_submit_artifact` when
   the session has it, otherwise `ibuild engine artifact submit` (see the
   engine-artifact step).
3. `ibuild engine gates` (review phase only) from the worktree — it runs this
   repo's own declared checks and records the reports a review needs (see the
   engine-gates step).
4. `ibuild engine report` to advance each phase (investigation → execution →
   review).
5. Repeat until the goal is **ready to deliver**: every task complete, the
   review verdict clean at the current head, CI green. Then go to step 5.5.

**Do not call `ibuild engine goal accept` yourself.** On a repo where `main`
merges continuously, a hand-driven accept loses the race by construction.
Step 6 below is the fix.

Rules that save a round trip:

- Do not push mid-review-round — it moves the head and re-breaks
  review-at-head. Batch pushes.
- A review verdict must grade every pre-merge criterion — omitting one FAILS
  it, omitting a finding RESOLVES it.
- Review with the engine-review step, never a raw code-review invocation — it
  must resolve files against the worktree, not the primary clone.
- Ship the below-1024px responsive treatment in the same PR for any UI change.
- Rebase periodically and always before a long pause:
  `ibuild engine active-goal rebase`.
- **A rebase conflict** → `git rebase --abort` (never hand-resolve it here) and
  go to step 6: hand off and let the delivery queue's proactive rebase resolve
  it — a regenerable lockfile or purely-additive code is auto-resolved. Only
  hand-fix a conflict that is IN a file this goal's own diff owns, and only
  once the merge train has already reported it as a real, same-line
  disagreement.
- **A CI failure not caused by this goal's own diff** (a repo-wide
  staleness/collision guard, a stale generated snapshot, an unrelated
  version-guard) is not yours to fix — push what you have and go to step 6;
  the delivery queue's own triage (repo-wide / flake / infra) handles it.
  Reserve a hand `git merge origin/main` for the rare case where `arm-accept`
  itself reports a conflict it cannot resolve, and say so explicitly first.
- A `hand-back` 422 means the goal wasn't in human mode — harmless, go
  straight to `arm-accept`.
- A follow-up request while this goal is open → back to *Step 0.5*.

## Step 5.5 — review checkpoint: ask, don't wait on free text

Ready-to-deliver is a checkpoint, not a green light. Stop and report, in one
short message:

- **The PR URL** (`ibuild engine goal status <goalId>` prints it).
- **A live preview**, if this repo has one — never claim a preview URL that
  does not exist; say plainly when the repo has none and offer a local
  screenshot instead for UI work.

Then ask the next step as real options — `pm_ask_question` when the PM bridge
is available, else your tool's own multiple-choice question — never a
plain-text "say iterate or ship it" sentence:

```
question: "G#<n> is built and its checks pass. What next?"
options:
  - "Preview it"    — start the app here and try it; you can ask for changes while it runs
  - "Make changes"  — tell me what to change
  - "Ship it"       — hand it to the delivery queue (merges once checks pass)
```

Do not proceed to step 6 unprompted — this question IS the review gate.

- **Preview it** → start the app from THIS worktree (reuse one already
  running from it; a server from another checkout is not this goal's code) —
  `ibuild engine goal preview <goalId> --local` where that verb is available,
  otherwise this repo's own declared dev command — and open it in your tool's
  built-in browser when it has one, else the OS default browser. Then go
  straight into iterate mode: say where it's running, and after each change
  re-ask this same question with "Preview it" reworded to "Refresh preview".
- **Make changes** → the ordinary step-5 loop again: new commits, gates,
  a fresh review round so review-at-head is re-stamped on the new head. Come
  back to this checkpoint with the same handles when it is green and clean
  again.
- **Ship it** → step 6, stopping any preview server first. If the developer
  instead wants to click Accept themselves, that's the manual-stop variant
  (`--manual-stop`) — offer it only when they say so in chat, never by
  default.

## Step 6 — land it

Once ready-to-deliver, hand the goal to the delivery queue rather than staying
the merge queue yourself:

```bash
ibuild engine goal land <goalId>
```

This composes `hand-back` + `arm-accept` + `watch <goalId> --wait` in one
verb, and prints the goal's readiness before doing any of it. What each of the
three calls buys, and how to read what `land` prints when the watch wakes, is
in the engine-goal step's **Land** item (its step 7); do not duplicate it here.

### Default: hand off and stop, once armed — do not wait for accepted

**One goal per session, and this is the exit.** The moment `land`'s one-shot
confirmation watch comes back clean, close out immediately — do not hold the
session or the worktree open until the goal reaches accepted/delivered:

```bash
ibuild engine active-goal unbind
ibuild engine finish <taskId>          # FROM THE PRIMARY CLONE
```

Tell the developer the goal is armed and riding the delivery queue — not
"watching until it merges." Only an auto-driven goal is a delivery-queue
member: only it gets its branch proactively rebased when it holds headship,
and only it can ride a merge train, where the throwaway train branch means
its review never goes stale. Holding a session and worktree open purely to
babysit a goal to acceptance starves the delivery queue of exactly that —
don't do it by default, and do not start another goal in the same session
afterward: clear the conversation first, or open a fresh one with
`ibuild engine goal session <goalId>` (see the engine-goal-new step, step 4).

If what the watch surfaces instead is the goal's OWN diff being red (or a
pause that reopened work on it), fix it before closing out:
`ibuild engine goal disarm-accept <goalId>` → `ibuild engine goal take
<goalId>` → fix in the same worktree → back to step 5.5 → step 6 again. A
routine event the engine is already handling itself — `ci_infra_rerun`,
`branch_refreshed`, `ci_platform_outage`, or similar — needs nothing; close
out anyway.

**Changed your mind after arming?** Not a new mode, just the same cycle:
`ibuild engine goal disarm-accept <goalId>` → `take` → edit → back to step 5.5
→ step 6 again.

### Manual-stop variant (the developer wants to click Accept themselves)

This is a deliberate deviation from the default above — offer it only when
the developer asks for it, never switch into it unprompted:

```bash
ibuild engine goal land <goalId> --manual-stop
```

Keep the session and the worktree open until `ibuild engine goal status
<goalId>` says accepted — an un-armed goal is not a delivery-queue member, so
its branch is not proactively rebased; a long wait can still need one refresh
round before the developer's click lands. The merge can also come back
needing a fix (a conflict, a red diff, a fleet review finding); when it does,
same cycle as above: `disarm-accept` → `take` → fix → step 5.5 → step 6.
Once `status` says accepted, close out the same way (`active-goal unbind` +
`engine finish <taskId>` from the primary clone).

## Failure recovery

- **A blocker never starts moving** — `ibuild engine watch <blocker> --wait`
  can wait a long time on a dormant, unqueued goal. Surface this rather than
  waiting silently forever; ask whether to work the blocker directly, keep
  waiting, or proceed with a stub.
- **A 409 names a batch** — read its `code`: a batch/merge-train code means
  the delivery queue already has this goal, not an error to fix; keep
  watching.
- **The interactive lease drops** (a very long gates run, a long pause) —
  re-run `ibuild engine work <taskId> --force` only if the run genuinely died;
  `ibuild engine status <task>` tells you first.
- **`ibuild engine gates` hard-resets the checkout when it finishes** — commit
  before starting it, and don't edit the worktree while it runs; edits made
  mid-run are silently destroyed.
- **A `hand-back` revived a planning task** — hand-back can re-arm decompose
  and leave a duplicate planning task open; cancel the duplicate from the
  goal's page in the Build web app.
- **An `out_of_band_commit` pause fired after pushing while the goal was
  taken** — resolve it rather than re-pushing: answer the pause on the goal's
  page in the Build web app and choose to continue.
- **No PR is open yet for this goal** — link or create one:
  `ibuild engine goal link-pr <goalId> [--number N]`, or start the next goal
  with `--pr-boundary` so one opens automatically.

## Notes

- Related: the engine-goal-new step (create + choose a run mode from scratch),
  and the engine-goal, engine-work, engine-watch, engine-goals and
  engine-review steps.
