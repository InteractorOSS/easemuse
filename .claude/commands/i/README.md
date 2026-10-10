---
name: commands-index
version: "4.0.0"
description: Catalog of /i/ slash commands — the goal + task workflow Interactor Build runs.
---

# `.claude/commands/i/` — Interactor Build commands

Commands committed to this repo and available to everyone working on it.
Invoked with the `/i/` prefix (e.g. `/i/engine-work`, `/i/engine-goal`).

New here? These command DOCS are installed into the repo by `ibuild` (and kept
current by its template-update checks), so `git pull` gives you the docs. The
commands they invoke run through the **`ibuild` binary** (`ibuild engine <cmd>`),
so you also need ibuild installed — **v1.1 or newer** (older binaries have no
`engine` subcommand). Install it with `brew install InteractorOSS/tap/build`,
`winget install InteractorOSS.build`, or the curl installer; it is the same
binary that installed these docs and syncs `.build/`.

You are not expected to type these. Say what you want in plain language and your
assistant runs the right one for you — see `.build/CLAUDE.md` §3.

## Engine lifecycle commands

The `/i/engine-*` commands drive goals and the tasks beneath them. They are thin
terminal vehicles over the account-level `/api/v1/me/engine/*` endpoints,
authenticated with a **daemon token** (`PM_DAEMON_TOKEN` in `.env.local`; the web
app → Settings → Agent Tokens). The daemon token is the same account **agent token**
a Docker fleet uses — `ibuild setup` (auto-run by the first `ibuild sync`) writes
it to `.env.local` alongside the project sync token in `.build/.sync`, so one
command provisions both.

| Command | Purpose |
| ------- | ------- |
| [`/i/engine-goal-create`](engine-goal-create.md) | Start a new **goal** — the objective that owns a branch and a PR (auto-starts on an AUTO project; `--dormant` to queue it later with `engine goal admit`). |
| [`/i/engine-create`](engine-create.md) | Add a **task** beneath a goal (starts in investigation, queued). |
| [`/i/engine-claim`](engine-claim.md) | Take the next task waiting in the queue. |
| [`/i/engine-work`](engine-work.md) | Open a session on a **specific** task (#N / slug / title). |
| [`/i/engine-status`](engine-status.md) | Show where a task stands — phase, state, its goal, anything it's waiting on. |
| [`/i/engine-watch`](engine-watch.md) | Follow a goal's progress live instead of polling; `--wait` returns only when something needs you. |
| [`/i/engine-readiness`](engine-readiness.md) | Check and fix whether a connected repo is set up for agents to run work on it (list / status / assess / setup / accept / regenerate) — the CLI form of the web Fleet setup panel. |
| [`/i/engine-approve`](engine-approve.md) | Sign off (or reject) a task's plan when the project holds tasks for a human OK before execution. |
| [`/i/engine-report`](engine-report.md) | Report how a run went, moving the task to its next phase. |
| [`/i/engine-review`](engine-review.md) | Code-review the work in the task's **worktree** (so the review reads the code you changed, not a stale checkout). |
| [`/i/engine-goal`](engine-goal.md) | Goal decisions — deliver it / send it back for changes / start a queued goal / pause / resume. |
| [`/i/engine-finish`](engine-finish.md) | Confirm a task is done, clear the local run context, and clean up its worktree. |

## Design

| Command | Purpose |
| ------- | ------- |
| [`/i/interactor-design-guide`](interactor-design-guide.md) | Apply Interactor design system to UI/UX changes. |

## Conventions

- **Frontmatter:** every command file has `name:`, `version:`, `description:`.
- **Plain English first:** the top paragraph describes what the command does without requiring bash literacy.
- **Steps numbered:** `### 1.`, `### 2.`, etc. Each step states what runs and what's expected back.
- **Pre-flight checks:** conditions that must be true before any action; any failure aborts with a clear message.
- **Failure recovery:** explicit "what to do when X fails" — never silent retries; never `--force` without approval.

## Hard rules (encoded in every relevant command)

- Never push to your default branch directly — work lands only through a merged PR.
- Never deploy to production without a successful staging deploy and its checks.
- Never skip the security gate. It runs a real, daemon-run scan (secrets + dependency
  advisories) in the review phase, gated the same way as typecheck/lint: it blocks once your
  `security:` step is declared, and reads as not-configured (never a fake pass) until it is.
- Never `git push --force` to a protected branch.
- Never commit a secret and expect it to go unnoticed — the security gate's secret scan reads
  this round's diff and blocks completion on any match, whatever your configured severity. It
  runs at review, not at commit time, so a leaked secret still has to be rotated, not just
  removed from a later commit.
- Never modify another connected repo from this one's commands.
