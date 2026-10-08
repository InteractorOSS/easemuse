---
name: engine-goal
description: "Look at a goal, and decide about it, from the terminal — check its **status** (one read that tells you where the goal actually stands), accept a goal (deliver it), request changes (send it back for rework), **admit** it (start a goal that was created but not yet queued — the second half of the `engine:goal-create` → start path), **pause / resume** it (a reversible hold on a started goal, optionally stopping its in-flight runs), or **land** a goal you're driving by hand (hand it to the delivery queue — hand-back + arm-accept + watch, in one verb — instead of hand-retrying `accept` against a moving `main`). A goal owns the branch and the PR, so accepting it is what lands the work, requesting changes is what reopens it, and pausing is the reversible brake that holds a goal without closing it."
---

# /engine-goal

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
