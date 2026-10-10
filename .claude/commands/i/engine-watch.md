# /engine-watch

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
