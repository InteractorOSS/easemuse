---
name: ship
description: "Turn a working tree full of changes — or a branch already pushed ahead of the default branch — into a goal, with no manual `goal-create --pr-boundary` / `gh pr create` / `goal link-pr` dance. Commits any uncommitted changes (with your confirmation), pushes to `ship/<user>-<short-sha>` (or a branch you name), then adopts that push as a **PR-boundary goal** — built for a moment in human mode so nothing else can claim it mid-construction, then handed straight back to agent mode with one review task already queued — a linked PR already open, ready for the normal review → CI → delivery-queue path."
---

# /ship

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
