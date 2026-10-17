---
name: engine-goal-new
version: "1.0.0"
description: Create a goal from a request, then ask how to run it — human here, human in a new session, or the fleet — and apply that choice.
---
# /engine-goal-new

## Plain English

Turn a request or the current conversation into one or more engine goals, then
ask the developer **how each should run** rather than assuming. This is the
"start a goal for X" flow: it stops one step short of building anything, so
the run-mode choice is always a deliberate one, not a default. When a request
decomposes into several independently shippable outcomes, this also ASKS
whether to create them as a tracked Group rather than filing them flat
silently — see step 2.

## When to use

- "start a goal for X", "new goal for X", "file a goal for this bug".
- The developer describes work with no existing goal to attach it to (check
  the engine-goals step first — never create a duplicate).

## Prerequisites (one-time)

Same as every engine command: `PM_DAEMON_TOKEN` in `.env.local`, run from the
project root or below.

## Steps

### 1. Dedupe first

```bash
ibuild engine goals
```

Match on intent. If something already covers this, report its state
(`ibuild engine goal status <goalId>`) and stop here — reuse it via the
engine-goal-run step, don't create a second one.

### 2. Decide how many goals this really is

Before creating anything, check whether the request is genuinely **several
independently reviewable/shippable outcomes** — not just several steps toward
one PR. See "Tasks vs Group parts" below for the line; most requests are one
goal, even ones that need several implementation steps.

- **One goal** → skip to step 3.
- **More than one** → do NOT file the parts flat and do NOT decide silently.
  Ask the developer, listing the parts (with `pm_ask_question` if the PM
  bridge is configured, your tool's own multiple-choice question otherwise):

  > "This looks like N separate outcomes — `<part 1 title>`, `<part 2
  > title>`, … . Create them as a Group (tracked and delivered together), or
  > as N separate goals?"

  - **"Create as a Group"** → create the parent goal first (step 3, using a
    title that names the umbrella), then create each part (step 3, once per
    part) with `--parent <parentGoalId>` — `goal-create` already accepts
    `--parent`; there is no separate "group" flag.
  - **"Create as separate goals"** → create each part as its own goal (step 3,
    once per part), with no `--parent`.

#### Tasks vs Group parts — the one discriminator

A goal already decomposes into **tasks** — a planning task, then one or more
implementation tasks, all shipping through the goal's single PR. A Group is
not a second way to say the same thing:

- **Task**: a step toward ONE PR. Shares the goal's single branch, single
  review, single acceptance. If the pieces would only ever be accepted or
  rejected together, they're tasks under one goal — the default.
- **Group part**: its own reviewable, shippable unit — own branch, own PR,
  own review/acceptance, billed on its own delivery. Propose a Group only
  when the pieces could each be accepted or rejected independently, or one PR
  would be a mixed PR nobody could review, or they target different
  repos/surfaces with different "done when"s.

When in doubt, it's tasks under one goal — that costs the developer nothing to
correct later (a goal can still be split into a Group after the fact via the
engine-goal step's attach/detach, which this step doesn't change).

### 3. Create it, dormant

```bash
ibuild engine goal-create "<title>" --desc "<what>" --why "<why>" \
  --done-when "<acceptance>" --type <feature|bug|chore> --priority <low|medium|high> \
  --repos <owner/repo> --dormant [--parent <parentGoalId>]
```

`--dormant` is required — born task-less, nothing spawns before a run mode is
chosen. Write a real description: what, why, and a concrete "done when". Pass
`--parent <parentGoalId>` only when step 2 decided this is a Group part; omit
it for a single goal or a Group's parent itself.

### 4. Ask the run mode

Ask the developer, in plain language, how this goal should run:

- **"I'll build it now, in this session"** — human-driven, right here.
- **"I'll build it, but in a fresh session"** — human-driven, started
  elsewhere.
- **"Hand it to the fleet"** — agent-driven, unattended.

Don't guess this — the three modes have materially different consequences
(who can touch the branch, whether the fleet can claim it, whether it needs a
review checkpoint from a human).

### 5. Apply the choice

Repeat steps 3–5 once per goal decided in step 2 (a single goal, or a Group's
parent plus each of its parts).

| Choice | Commands |
| --- | --- |
| Build it now, this session | `ibuild engine goal take <goalId>` then `ibuild engine active-goal bind <goalId>`, then continue with the engine-goal-run step from its step 4 onward |
| Build it, fresh session | `ibuild engine goal take <goalId>` now, then tell the developer to run `ibuild engine goal session <goalId>` — a lean fresh session in the goal's worktree (no personal plugins/MCP servers), already started on the engine-goal-run step for that goal |
| Hand it to the fleet | `ibuild engine goal queue <goalId>` — warn in one line: this admits the goal and an idle fleet agent may claim it immediately |

`take` is the fleet lockout (flips the goal to human-driven; refuses fleet
claims, queue and resume). `queue` is the opposite: it admits the goal and
makes it claimable. Never run both on the same goal.

## Failure recovery

- **`.build/.sync not found`** — this folder isn't linked to a Build project.
  Run `ibuild sync` from the project root.
- **Repo mismatch** — if the target repo belongs to a different project than
  this folder, `ibuild engine goal-create` resolves against the wrong
  project; create the goal from a checkout of the right project instead of
  hand-building an API call.

## Notes

- This command never writes code — it stops at "goal exists, run mode
  applied." The actual build loop is the engine-goal-run step.
- Related: the engine-goal-run, engine-goals, engine-goal and engine-queue
  steps.
