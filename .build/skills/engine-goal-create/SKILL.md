---
name: engine-goal-create
description: "Create a new engine **goal** in the current project from the terminal — the headless counterpart of the web Goals page's \"New goal\" form. A goal is the engine's integration unit (the *objective*; it owns the branch + PR and is what a GitHub issue maps to). This is the goal-grain sibling of the `engine-create` step, which mints an EngineTask *under* a goal. It authenticates with the same daemon token the rest of the local engine loop uses, so a developer — or the headless daemon — can create a goal without the web UI."
---

# /engine-goal-create

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
