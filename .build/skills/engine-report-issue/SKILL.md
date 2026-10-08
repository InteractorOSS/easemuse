---
name: engine-report-issue
description: "File a **friction report** — a stuck lease, a bridge 409, a confusing refusal, a missing capability — as a deduplicated Feedback report on the Build project, via a server-side cross-tenant hop. This session never needs its own access to Build. `.build/CLAUDE.md` §4 is why this exists: an infrastructure failure is something to REPORT, not a question for a human and not something to silently work around."
---

# /engine-report-issue

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
