---
name: engine-goals
version: "1.0.0"
description: List this project's engine goals — the dedupe-by-intent read before creating a new one.
---
# /engine-goals

## Plain English

List the project's **goals** — a terminal read of what already exists, so you
can check "does something like this already exist?" before minting a new one.
Defaults to open/in-flight goals (not `accepted`/`cancelled`); pass `--all` for
the full history.

## When to use

- Before creating a goal — dedupe by intent, not just by title match
  (the engine-goal-run and engine-goal-new steps do this automatically).
- "what goals are open right now?", "is there already a goal for X?", "list the
  project's goals".

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` (PM web UI
  → Settings → Agent Tokens) — the same token the rest of the local engine loop
  uses.
- Run from the project root or below (`.build/.sync` is found by walking up).

## Steps

```bash
ibuild engine goals                 # open/in-flight goals: "#<n> <status> <title>"
ibuild engine goals --all           # every goal, including accepted/cancelled
ibuild engine goals --limit 50      # stop after N rows
ibuild engine goals --tag urgent --tag billing   # goals carrying EVERY named tag (AND)
ibuild engine goals --category Payments          # goals in that category
ibuild engine goals --starred                    # goals YOU starred (your own star only)
```

The three label filters combine with each other and with `--all` / `--limit`,
and are applied by the server, so they are correct across every page. `--tag`
repeats or takes a comma list. A tag or category name nobody has used yet
lists nothing — it never falls back to "no filter". A `--tag` / `--category`
typed with no name is refused before anything is sent.

Sample output:

```
#42 open Fix the login redirect loop
#57 in_review Add CSV export to the reports page
```

## Why this pages instead of a raw API call

The unpaged read of this same endpoint caps at **100 rows ordered by
priority** — a moving window that can silently drop a goal you can prove is
active (a medium/low-priority goal crowded out as others are created or
re-prioritized). This command instead follows the response's cursor page by
page until there are no more, ordered by creation time — an exactly-once
sweep, never a window. Never hand-build the unpaged API call as a substitute
for this command.

## Failure recovery

- **`.build/.sync not found`** — this folder isn't linked to a Build project.
  Run `ibuild sync` from the project root (or `ibuild sync --paste-token`).
- **Missing / rejected `PM_DAEMON_TOKEN`** — mint an agent token in the PM web UI
  (Settings → Agent Tokens) and put it in `.env.local`, or re-run `ibuild setup`.

## Notes

- READ-ONLY — this changes nothing.
- `--limit` stops the sweep early and says so in its own line when it does, so
  a truncated list is never mistaken for the whole project.
- Related: the engine-goal step (act on one goal), the engine-goal-create step
  (mint a new one — check here first), and the engine-goal-run step (the
  workflow that uses this for dedupe).
