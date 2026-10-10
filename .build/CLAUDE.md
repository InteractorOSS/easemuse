# Working in this repo with Interactor Build

This file is the briefing every AI coding session reads before it touches this
repo. It was installed by **Interactor Build** (`ibuild`) alongside the
`/i/engine-*` commands in `.claude/commands/i/`, and it is kept up to date for
you — when a newer version is published, `ibuild` offers it as a pull request
you can read and merge.

It covers four things:

1. **How work reaches this repo** — goals, tasks, and the branch/PR they ship on.
2. **The `.build/` folder** — what it is, who owns it, what's secret, and the
   throwaway `.tasks/` folder that sits beside it.
3. **How to drive a session** — plain language in, `/i/engine-*` commands under the hood.
4. **How to answer a question** the system asks you mid-run.

If you're an AI session: read all four before writing code. If you're a human:
skim §3 and §4 — the rest is context your assistant needs, not homework.

---

## 1. How work reaches this repo

Work is described in your Interactor Build project (the web app) and arrives
here as two nested things. Getting these two straight is the whole model:

### Goals — the objective

A **goal** is something you want to be true: a bug fixed, a feature shipped, an
outcome delivered. It's written in your own words, and it's the unit you review
and approve.

A goal owns:

- **one branch** — `goal/<goal-slug>`, cut from your default branch
- **one pull request** — everything done for that goal lands in it

So a goal is what a reviewer opens, reads once, and merges once. Nothing ships
to your default branch outside a goal's PR.

*(A goal that spans several connected repos owns one PR **per repo**, and is
delivered only when all of them merge. Most goals target a single repo.)*

### Tasks — the units of work beneath a goal

A goal is broken down into **tasks**. A goal usually starts with a planning
task that works out the approach, then one or more implementation tasks that
carry it out. Tasks are not separate pull requests — they all ship through
their goal's single PR.

Every task moves through the same three phases:

| Phase | What happens |
| --- | --- |
| **Investigation** | Read the code, find the real cause or shape of the work, and write down what will be done. |
| **Execution** | Make the change: code, tests, docs. Commit to the goal's branch. |
| **Review** | Check the work against what was asked — correctness, tests, scope — and fix what comes back. |

A task that finishes review is done. When every task under a goal is done and
the PR is green, the goal is ready to deliver.

### What this means when you're working

- **Never commit to the default branch.** Work happens on the goal's branch, in
  the goal's worktree. `/i/engine-work` puts you there.
- **One goal, one PR.** If you notice work that isn't part of this goal, don't
  fold it in — say so, and let it become its own goal. A mixed PR is a PR
  nobody can review.
- **Code your own change leaves with no remaining use is IN scope.** A stub, a
  placeholder, a dead export that nothing calls any more because of this
  change — delete it in this PR. That is not unrelated work; it is the other
  half of the change you just made. And if you are about to paste the same
  block into a second file, extract it instead.
- **Don't open the PR by hand.** The system opens and merges the goal's PR for
  you once the work and its gates are done.
- **Small change, no goal in sight?** If your project allows it, an interactive
  session can turn this off for itself — type "ibuild off" as a chat message
  (or run `ibuild engine gate off`), and "ibuild on" / `ibuild engine gate on`
  to turn it back on. The change still lands on its own branch through a
  hand-opened PR that runs CI; it just isn't tracked by a goal.

---

## 2. The `.build/` folder

`.build/` is the sync folder. A background daemon (`ibuild sync`, started for
you by `ibuild setup`) keeps it mirrored with your project in the web app.

**It is not a scratchpad.** Everything in it is either written by the daemon or
read by it. Notes, plans, and design documents belong in `docs/` or the repo
root — a stray markdown file dropped in `.build/` confuses the daemon and the
next person reading the tree.

### What's in it

| Path | What it is |
| --- | --- |
| `.build/CLAUDE.md` | This briefing. Installed and updated by `ibuild`. |
| `.build/config.json` | **Committed.** Which project this repo is connected to: `sync_url`, `project_id`, `setup_url`. Safe to read, safe to share. |
| `.build/.config.json` | **Committed.** Your project's conventions — see below. Edit this one. |
| `.build/.sync` | **Secret, gitignored.** Your project sync token. Never commit it, never paste it into a PR, issue, or chat. `ibuild` adds it to `.gitignore` for you. |
| `.build/vision.md` | Product direction, written in the web app, mirrored down here to read. |
| `.build/.data/` | The machine-readable mirror of your plan — tasks, phases, sprints, one file each plus an index — for the AI to read. |

### What syncs, and which way

- **Down (project → repo):** `vision.md` and everything under `.build/.data/`.
  The daemon refreshes them as things change in the web app, so a local edit to
  an index or summary file is overwritten on the next sync. Read them freely;
  don't treat them as a durable place to write.
- **Up (repo → project):** edits to the per-item detail files — the individual
  task, phase, and sprint markdown, and the personal work folder beside `.data/`.
  That's how notes written while working reach the project.
- **Neither:** `.build/.sync` never leaves your machine, and `CLAUDE.md` /
  `.config.json` are installed by `ibuild`, not by sync.

If you want work tracked, create a **goal** in the web app or with
`/i/engine-goal-create` — don't hand-write a file and hope the daemon adopts it.
IDs are minted by the server; an invented one is at best ignored.

### `.build/.config.json` — your project's conventions

This is the one file here you're meant to edit. It tells every session how
**your** repo is built and tested, so the commands don't have to guess:

- `package_manager` — `npm` / `pnpm` / `yarn` / `bun` (detected on first setup)
- `test_command`, `typecheck_command`, `lint_command` — name only the ones your repo
  really has. A repo with no tests (or no type-checking, or no linter) is fully
  supported: leave the setting out entirely rather than naming a command that does not
  exist, and every session will simply skip that check instead of failing on it
- `coverage` — the line/branch thresholds a change is held to
- `security` — which scanners run, and what severity blocks
- `deploy` — how staging and production are reached, and the rollback window
- `e2e` — how to start your app and where its UI lives, for end-to-end runs.
  `server_command` ships blank because only you know how your app boots — fill in
  your own dev-server command if you want end-to-end runs
- `worktree_root`, `merge_method` — where worktrees go, how PRs merge
- `workflow_version` — which version of this scaffold you have (leave it alone;
  `ibuild` sets it when it installs an update)

Change a value here rather than telling each session about your setup — the
daemon reloads the file whenever it changes, and an invalid file falls back to
defaults with a warning instead of breaking anything.

### The other folder: `.tasks/`

Once you start running work you'll see a second folder, `.tasks/`, at the repo
root, and the `/i/engine-*` command docs refer to it by name. It is **not** a
second copy of `.build/` and it is not synced. It's where the `ibuild engine`
commands keep the state of the run you're in the middle of:

| Path | What it is |
| --- | --- |
| `.tasks/.engine` | The claimed run — which task, which phase. Written by `/i/engine-claim` and `/i/engine-work`; cleared when the run reports a final result. Its presence is what stops a second run being claimed on top of the first. |
| `.tasks/.current` | The same task in the shape a session reads for context. |
| `.tasks/attachments/<goal-id>/` | Files attached to the goal in the web app — specs, screenshots, mockups — downloaded so a run can read them without network access, plus an `index.json` listing them. |

All of it is machine-local and disposable: the sync daemon watches `.build/`,
not this folder, so nothing here reaches your project, and it is safe to delete
once a run has finished. A current `ibuild` keeps that same run context in a
third folder, `.goals/` — the claimed run and the task a session reads, in place
of the two rows above — and it is run state through and through: nothing in it
is ever yours to commit.

**Ignore it by RULE, not file by file.** `ibuild` gitignores `.build/.sync` for
you and nothing else, so the rest is yours to cover — and a per-filename list
goes stale the next time `ibuild` learns to write a new one. Ignore each
folder's CONTENTS and re-include only the project files `ibuild` installs:

```gitignore
.goals/*
.tasks/*
!.tasks/CLAUDE.md
!.tasks/config.json
!.tasks/.config.json
!.tasks/vision.md
.build/*
!.build/CLAUDE.md
!.build/config.json
!.build/.config.json
!.build/vision.md
```

Use `<dir>/*`, never `<dir>/` — git cannot re-include a file whose parent
directory is excluded, so the trailing-slash form silently makes every `!` line
inert and untracks those project files outright. All three folders take the same
glob form, so the trap cannot creep back in by copying the line beside it;
`.goals/` just carries no negations, because nothing in it is ever committed. The
two bridge blocks are one rule written twice: your sync folder is where those four
installed project files live — `.build/` in a current repo, `.tasks/` in one from
before the rebrand — and in the other folder the negations simply match nothing.

**Why two folders?** The sync folder was itself called `.tasks/` before it was
renamed to `.build/`; the run-context and attachment paths still carry the old
name. Until they're unified the rule is short: `.build/` is your project,
mirrored — `.tasks/` is this run, throwaway.

---

## 3. Driving a session

### Plain language is the interface

You don't type commands. Say what you want:

- "work on goal 42"
- "let's do the login-redirect one"
- "what's the status of the billing goal?"
- "the checkout page is broken on mobile"

Your assistant translates that into the right `/i/engine-*` command and runs it
for you. The command docs in `.claude/commands/i/` exist so that translation is
consistent and reviewable — not so you have to learn them.

**If you're the assistant:** run the command on the person's behalf. Don't ask
them to type a slash command, and don't paste one for them to run. Surface only
the decisions a human actually has to make.

### The commands, and what runs them

The `/i/engine-*` commands are thin wrappers over the **`ibuild` binary**:

```bash
ibuild engine <cmd> [args]
```

You need **ibuild v1.1 or newer** — older binaries have no `engine` subcommand.
Install or upgrade it the same way you got it (`brew install
InteractorOSS/tap/build`, `winget install InteractorOSS.build`, or the curl
installer); it's the same binary that installed these docs and runs `.build/`
sync.

The catalog lives in [`.claude/commands/i/README.md`](../.claude/commands/i/README.md).
The ones you'll meet first:

| You say | It runs |
| --- | --- |
| "start a goal for X" | `/i/engine-goal-create` |
| "work on goal N" / "let's do <name>" | `/i/engine-work` |
| "what's next?" | `/i/engine-claim` |
| "how's goal N doing?" | `/i/engine-status` |
| "tell me when it's ready" | `/i/engine-watch` |
| "review this" | `/i/engine-review` |
| "ship it" (a finished hand-driven goal) | `ibuild engine goal land` (see `/i/engine-goal`) |
| "that's not right, redo it" | `/i/engine-goal` |

### Work happens in a worktree

`/i/engine-work` creates (or reuses) a **git worktree** for the goal — a
separate directory checked out on the goal's branch — and tells you to `cd`
there before starting your session. This is not optional housekeeping: it's
what stops two sessions running at once from clobbering each other's branch and
uncommitted files.

When the goal's PR has merged, run `/i/engine-finish` **from your main
checkout** to clean the worktree up. (Git won't remove a worktree you're
standing in.)

### Waiting on something — don't poll

When you're waiting for a run to finish, CI to go green, or a PR to merge,
don't write a `sleep` loop. Use `/i/engine-watch <goal> --wait`: it subscribes
to the events the server already sends and stays silent until something
actually needs you, then exits so you can act.

---

## 4. When the system asks you a question

Sometimes a run hits a decision it shouldn't make alone — an ambiguous
requirement, two reasonable designs, a scope call. It stops and asks.

**Where the question shows up:** the **Sessions** page in the Interactor Build
web app. Open it, read the question, pick an option. The run picks up your
answer and continues — you don't have to be at the terminal, and the session
keeps its context while it waits.

**If you're the assistant, asking:** use the bridge tools `pm_ask_question` (a
multiple-choice question) or `pm_request_design_discussion` (an open one) rather
than stopping in the terminal, so the question reaches whoever is actually
deciding. Write for that person — who may not be an engineer.

- The **headline** names *what is being decided*, in plain words. No file names,
  test names, branch names, PR numbers, or tool names — those go in the detail.
- Each **option** is an outcome someone can choose between, not an instruction
  to you. Add a one-line consequence so the trade-off is visible.
- Put the full technical grounding in the **detail**, where it's on the record
  for whoever reads it later.

Bad: *"Should I drop the type-fix from this PR since it touches unrelated test
suites in `checkout-client.test.tsx`?"*

Good: headline *"Ship the current changes now, or wait and include an unrelated
fix?"* — options *"Ship now"* (the other fix ships separately later) and *"Wait
and include it"* (this takes longer but ships both together) — with the file and
test names in the detail.

### What is *not* a question for a human

A missing credential, an expired token, a file the run can't read, a `401`/`403`
from GitHub — these are **infrastructure failures**, not decisions. Asking a
person can't fix them and just stalls the run. Report the failure loudly and
fail the run (`/i/engine-report` with a failure reason) so the operator can
restore the credential and requeue. Never guess your way past a spec you
couldn't read.

**Report it, don't just work around it.** The same friction — a stuck lease, a
bridge 409, a confusing refusal, a missing capability — is also worth filing as
its own report, separately from failing the current run, so it reaches whoever
fixes the engine rather than staying a private workaround: call `pm_report_issue`
(available in every phase) or run `ibuild engine report-issue "<title>"` from a
terminal. Either one files a deduplicated report on the Build project via a
server-side hop — you never need your own access to Build — and a linked copy
lands on this project's own board too. See `/i/engine-report`'s "Reporting a
friction problem" section for the full flag list.

---

## See also

- [`.claude/commands/i/README.md`](../.claude/commands/i/README.md) — the full command catalog
- `.build/vision.md` — where this project is headed
- `.build/.config.json` — your project's build, test, and deploy conventions
- Your repo's own `CLAUDE.md` / `AGENTS.md`, if you have one — codebase
  conventions live there; this file covers only how work flows in and out.
